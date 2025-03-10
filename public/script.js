document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("login-form");
    const googleSignInBtn = document.getElementById("google-signin");

    // Handle form submission
    loginForm.addEventListener("submit", function (event) {
        event.preventDefault(); // Prevent page reload
        
        const email = loginForm.querySelector("input[type='email']").value;
        const password = loginForm.querySelector("input[type='password']").value;

        if (!email || !password) {
            alert("Please fill in all fields.");
            return;
        }

        // Mock login request (Replace with actual API call)
        console.log("Logging in with:", email, password);
        alert("Login successful (Mock)");
    });

    // Handle Google Sign-In (Replace with real OAuth logic)
    googleSignInBtn.addEventListener("click", function () {
        alert("Redirecting to Google Sign-In... (Mock)");
    });
});
