const db = require("../config");
const nodemailer = require('nodemailer');
const moment = require('moment');
const cron = require('node-cron');



// Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Email Templates
const emailTemplates = {
    reminder: (habit) => `
        <h2>Habit Tracker Reminder</h2>
        <p>Don't forget to work on your habit: <strong>${habit.name}</strong></p>
        <p>Scheduled time: ${habit.timeOfDay}</p>
        <p>Target: ${habit.target_minutes} minutes</p>
        <p>Current progress: ${habit.current_progress} minutes (${Math.round((habit.current_progress/habit.target_minutes)*100)}%)</p>
        <p>Due date: ${moment(habit.end_date).format('MMMM Do YYYY')}</p>
        <a href="http://your-app-url.com/habits">Track your progress now</a>
    `,
    missed: (habit) => `
        <h2>Missed Habit Alert</h2>
        <p>You missed updating your habit: <strong>${habit.name}</strong> today!</p>
        <p>This will affect your progress toward your goal.</p>
        <p>Current progress: ${habit.current_progress} minutes (${Math.round((habit.current_progress/habit.target_minutes)*100)}%)</p>
        <a href="http://your-app-url.com/habits">Update your progress now</a>
    `
};
// Helper function to send email
async function sendHabitNotification(email, habit, type = 'reminder') {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: type === 'reminder' 
                ? `Reminder: ${habit.name}` 
                : `Missed: ${habit.name}`,
            html: emailTemplates[type](habit)
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (err) {
        console.error('Error sending email:', err);
        return false;
    }
}


// Check for missed habits daily at 11:59 PM
cron.schedule('59 23 * * *', async () => {
    try {
        const [habits] = await db.promise().query(`
            SELECT h.*, u.email 
            FROM habits h
            JOIN users u ON h.user_id = u.id
            WHERE h.notification_enabled = TRUE
            AND h.is_completed = FALSE
            AND h.end_date >= CURDATE()
        `);

        const today = moment().format('YYYY-MM-DD');
        
        for (const habit of habits) {
            const [logs] = await db.promise().query(
                `SELECT 1 FROM habit_logs 
                 WHERE habit_id = ? 
                 AND DATE(logged_at) = ? 
                 LIMIT 1`,
                [habit.id, today]
            );

            if (logs.length === 0) {
                await db.promise().query(
                    `INSERT INTO habit_logs 
                     (habit_id, progress, notes, status) 
                     VALUES (?, ?, ?, ?)`,
                    [habit.id, 0, 'Missed update', 'missed']
                );

                await sendHabitNotification(habit.email, habit, 'missed');
            }
        }
    } catch (err) {
        console.error('Error in daily habit check:', err);
    }
});

// Updated controller methods
exports.getHabits = async (req, res) => {
    const userId = req.params.userId;
    const { timeOfDay } = req.query;

    try {
        let query = `
            SELECT 
                h.id, h.user_id, h.name, h.category, h.timeOfDay,
                h.target_minutes, h.current_progress, h.is_completed,
                DATE_FORMAT(h.start_date, '%Y-%m-%d') as start_date,
                DATE_FORMAT(h.end_date, '%Y-%m-%d') as end_date,
                h.notification_enabled,
                u.email
            FROM habits h
            JOIN users u ON h.user_id = u.id
            WHERE h.user_id = ?
        `;
        let params = [userId];

        if (timeOfDay) {
            query += " AND h.timeOfDay = ?";
            params.push(timeOfDay);
        }

        const [habits] = await db.promise().query(query, params);
        
        // Add progress percentage
        const habitsWithProgress = habits.map(habit => ({
            ...habit,
            progress_percentage: Math.round((habit.current_progress / habit.target_minutes) * 100)
        }));

        res.json(habitsWithProgress);
    } catch (err) {
        console.error("Error fetching habits:", err);
        res.status(500).json({ error: "Failed to fetch habits" });
    }
};
exports.updateHabit = async (req, res) => {
    const { id } = req.params;
    const { name, category, timeOfDay, start_date, end_date, target_minutes } = req.body;

    try {
        await db.promise().query(
            `UPDATE habits 
             SET name = ?, category = ?, timeOfDay = ?, 
                 start_date = ?, end_date = ?, target_minutes = ?
             WHERE id = ?`,
            [name, category, timeOfDay, start_date, end_date, target_minutes, id]
        );
        
        res.json({ message: "Habit updated successfully" });
    } catch (err) {
        console.error("Error updating habit:", err);
        res.status(500).json({ error: "Failed to update habit" });
    }
};

exports.addHabit = async (req, res) => {
    const { user_id, name, category, timeOfDay, start_date, end_date, target_minutes } = req.body;
    
    try {
        const [result] = await db.promise().query(
            `INSERT INTO habits 
                (user_id, name, category, timeOfDay, start_date, end_date, target_minutes) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, name, category || null, timeOfDay, start_date || null, end_date || null, target_minutes || 30]
        );

        const [habit] = await db.promise().query(
            `SELECT h.*, u.email 
             FROM habits h
             JOIN users u ON h.user_id = u.id
             WHERE h.id = ?`, 
            [result.insertId]
        );

        if (habit[0].notification_enabled) {
            await sendHabitNotification(habit[0].email, habit[0]);
        }

        res.status(201).json(habit[0]);
    } catch (err) {
        console.error("Error adding habit:", err);
        res.status(500).json({ error: "Failed to add habit" });
    }
};

exports.updateHabitProgress = async (req, res) => {
    const { id } = req.params;
    const { progress, notes, mark_completed } = req.body;

    // Validate input
    if (!id || isNaN(id)) {
        return res.status(400).json({ error: "Invalid habit ID" });
    }

    try {
        // Start a transaction
        const connection = await db.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Get current habit data
            const [habits] = await connection.query(
                `SELECT h.*, u.email 
                 FROM habits h
                 JOIN users u ON h.user_id = u.id
                 WHERE h.id = ?`, 
                [id]
            );
            
            if (habits.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: "Habit not found" });
            }

            const habit = habits[0];
            let newProgress = habit.current_progress;
            let isCompleted = habit.is_completed;

            // Update progress if provided
            if (progress && !isNaN(progress)) {
                newProgress = Math.min(habit.current_progress + parseInt(progress), habit.target_minutes);
                await connection.query(
                    `UPDATE habits 
                     SET current_progress = ?, 
                         last_updated = NOW() 
                     WHERE id = ?`,
                    [newProgress, id]
                );

                // Log the progress update
                await connection.query(
                    `INSERT INTO habit_logs 
                     (habit_id, progress, notes) 
                     VALUES (?, ?, ?)`,
                    [id, progress, notes || null]
                );
            }

            // Mark as completed if requested
            if (mark_completed && !isCompleted) {
                isCompleted = true;
                await connection.query(
                    `UPDATE habits 
                     SET is_completed = ?, 
                         current_progress = target_minutes 
                     WHERE id = ?`,
                    [true, id]
                );
            }

            // Commit transaction
            await connection.commit();

            // Send notification if enabled
            if (habit.notification_enabled && progress) {
                try {
                    await sendHabitNotification(habit.email, {
                        ...habit,
                        current_progress: newProgress,
                        is_completed: isCompleted
                    });
                } catch (notificationError) {
                    console.error("Notification failed:", notificationError);
                    // Don't fail the whole request if notification fails
                }
            }

            // Return updated habit
            const [updatedHabit] = await connection.query(
                `SELECT * FROM habits WHERE id = ?`, 
                [id]
            );

            res.json({
                ...updatedHabit[0],
                progress_percentage: Math.round((updatedHabit[0].current_progress / updatedHabit[0].target_minutes) * 100)
            });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (err) {
        console.error("Error updating habit progress:", err);
        res.status(500).json({ 
            error: "Failed to update habit progress",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

exports.getHabitLogs = async (req, res) => {
    const { id } = req.params;

    try {
        const [logs] = await db.promise().query(
            `SELECT * FROM habit_logs 
             WHERE habit_id = ? 
             ORDER BY logged_at DESC`,
            [id]
        );

        res.json(logs);
    } catch (err) {
        console.error("Error fetching habit logs:", err);
        res.status(500).json({ error: "Failed to fetch habit logs" });
    }
};

exports.deleteHabit = async (req, res) => {
    const { id } = req.params;

    try {
        // First delete related logs to maintain referential integrity
        await db.promise().query(
            "DELETE FROM habit_logs WHERE habit_id = ?",
            [id]
        );

        // Then delete the habit
        const [result] = await db.promise().query(
            "DELETE FROM habits WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Habit not found" });
        }

        res.json({ 
            success: true,
            message: "Habit and its progress logs deleted successfully" 
        });
    } catch (err) {
        console.error("Error deleting habit:", err);
        res.status(500).json({ 
            error: "Failed to delete habit",
            details: err.message 
        });
    }
};

exports.toggleNotification = async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;

    try {
        await db.promise().query(
            `UPDATE habits SET notification_enabled = ? WHERE id = ?`,
            [enabled, id]
        );

        res.json({ message: "Notification preference updated" });
    } catch (err) {
        console.error("Error updating notification preference:", err);
        res.status(500).json({ error: "Failed to update notification preference" });
    }
};