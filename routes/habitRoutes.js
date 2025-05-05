const express = require("express");
const router = express.Router();
const habitController = require("../controllers/habitController");

// Routes
router.get("/:userId", habitController.getHabits);
router.post("/", habitController.addHabit);
router.put("/:id/progress", habitController.updateHabitProgress);  
router.put("/:id", habitController.updateHabit);                  
router.delete("/:id", habitController.deleteHabit);

module.exports = router;