const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// Initialize Notion Client using the specific Global Mix secrets
const notion = new Client({ auth: process.env.GLOBALMIX_NOTION_API_KEY });
const DATABASE_ID = process.env.GLOBALMIX_NOTION_DB_ID; 

// Helper function to safely extract text from Notion properties
const getText = (prop) => {
    if (!prop) return "N/A";
    if (prop.title && prop.title.length > 0) return prop.title[0].plain_text;
    if (prop.rich_text && prop.rich_text.length > 0) return prop.rich_text[0].plain_text;
    if (prop.select) return prop.select.name;
    if (prop.url) return prop.url;
    return "N/A";
};

async function generateSite() {
    console.log('Connecting to Global Mix Notion Database...');

    if (!process.env.GLOBALMIX_NOTION_API_KEY || !process.env.GLOBALMIX_NOTION_DB_ID) {
        console.error("❌ Missing API Key or Database ID in environment variables.");
        process.exit(1);
    }

    try {
        // 1. Fetch all trips from Notion
        const response = await notion.databases.query({
            database_id: DATABASE_ID,
        });

        const trips = response.results.map(page => {
            const props = page.properties;
            
            return {
                id: getText(props['Trip ID']),
                title: getText(props['Trip Name'] || props['Title']), 
                region: getText(props['Region']),
                category: getText(props['Category']),
                duration: getText(props['Duration']),
                countries: getText(props['Location'] || props['Location/Countries']),
                route: getText(props['Route']),
                experiences: getText(props['Experiences']) || "Exclusive private tours, VIP access, curated luxury",
                hotels: getText(props['Hotels']),
                image: getText(props['Image URL']),
                slug: getText(props['Slug']) !== "N/A" 
                        ? getText(props['Slug']) 
                        : getText(props['Trip Name'] || props['Title']).split(' ')[0] 
            };
        });

        console.log(`Found ${trips.length} trips. Building pages...`);

        // 2. Read the master template
        const templatePath = path.join(__dirname, 'trip-template.html');
        if (!fs.existsSync(templatePath)) {
            console.error("❌ trip-template.html not found! Make sure it is in the root directory.");
            process.exit(1);
        }
        const template = fs.readFileSync(templatePath, 'utf-8');

        // 3. Generate a folder and index.html for each trip
        trips.forEach(trip => {
            const safeRegion = trip.region.toLowerCase().replace(/[^a-z0-9]/g, '');
            const safeSlug = trip.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

            const dirPath = path.join(__dirname, safeRegion, safeSlug);
            
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // Inject data into template
            let newHtml = template
                .replace('{{TITLE}}', trip.title)
                .replace('{{TRIP_JSON_DATA}}', JSON.stringify(trip));

            fs.writeFileSync(path.join(dirPath, 'index.html'), newHtml);
            console.log(`✅ Created: /${safeRegion}/${safeSlug}`);
        });

        console.log('🎉 Build complete! All static pages generated.');

    } catch (error) {
        console.error("❌ Error fetching from Notion:", error.message);
        process.exit(1); // Stop the GitHub Action if it fails
    }
}

generateSite();
