/**
 * GlobalMix Online - Custom JavaScript
 */

// 1. Function to Dynamically Update Footer Year
function updateCopyrightYear() {
    // Select the footer paragraph content in the HTML
    const footerParagraph = document.querySelector('.site-footer p');
    
    // Check if the element exists before trying to modify it
    if (footerParagraph) {
        // Get the current year
        const currentYear = new Date().getFullYear();
        
        // Update the inner HTML of the paragraph
        // It now shows the start year (2025) and the current year (e.g., 2025 - 2026)
        footerParagraph.innerHTML = `&copy; 2025 - ${currentYear} GlobalMix Online. All rights reserved.`;
    }
}

// Execute the function once the page is fully loaded
document.addEventListener('DOMContentLoaded', updateCopyrightYear);


// 2. Example: Simple Scroll Effect for Navigation
// Smoothly scrolls to a section when a nav link is clicked.
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        // Check if the link is an internal link (starts with #)
        if (this.getAttribute('href').length > 1) { 
            e.preventDefault();
            
            // Get the element to scroll to
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        }
    });
});
