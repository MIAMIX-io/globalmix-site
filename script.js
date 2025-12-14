document.addEventListener('DOMContentLoaded', function() {
    // Enable smooth scrolling for all links with a hash (#)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            // 1. Get the target ID from the href attribute (e.g., "#about")
            const targetId = this.getAttribute('href');
            
            // 2. Safely attempt to find the target element
            const targetElement = document.querySelector(targetId);

            // 3. CHECK if the element was successfully found before calling scrollIntoView()
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            } else {
                // Optional: Log a message to the console for debugging
                console.error(`Error: Target element not found for href: ${targetId}`);
            }
        });
    });
});
