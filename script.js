document.addEventListener('DOMContentLoaded', function() {
    // Enable smooth scrolling for all links with a hash (#)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // You can add more interactive elements here later, such as:
    // 1. A toggle function for a mobile navigation menu.
    // 2. Form submission handling for the contact section.
    // 3. Simple fade-in animations on scroll.
});
