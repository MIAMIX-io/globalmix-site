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
    if (prop.status) return prop.status.name;
    if (prop.url) return prop.url;
    if (prop.formula) return prop.formula.string || "N/A"; 
    return "N/A";
};

async function generateSite() {
    console.log('Connecting to Global Mix Notion Database...');

    if (!process.env.GLOBALMIX_NOTION_API_KEY || !process.env.GLOBALMIX_NOTION_DB_ID) {
        console.error("❌ Missing API Key or Database ID in environment variables.");
        process.exit(1);
    }

    try {
        const response = await notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                and: [
                    {
                        property: 'Sync to GitHub',
                        checkbox: {
                            equals: true
                        }
                    },
                    {
                        property: 'Status',
                        status: {
                            equals: 'Ready to Sync'
                        }
                    }
                ]
            }
        });

        const trips = response.results.map(page => {
            const props = page.properties;
            
            // 1. EXTRACT CLEAN SLUG FROM NOTION
            // If Notion has "globalmix.network/travel/africa/morocco-af-01", this extracts just "morocco-af-01"
            let rawSlug = getText(props['Slug']);
            if (rawSlug !== "N/A" && rawSlug.includes('/')) {
                rawSlug = rawSlug.split('/').pop(); 
            }
            const cleanSlug = rawSlug !== "N/A" ? rawSlug : getText(props['Trip Name'] || props['Title']).split(' ')[0];

            // 2. NORMALIZE REGION NAME
            // Converts "Latin America" to "latin-america", "Middle East" to "middle-east", etc.
            let rawRegion = getText(props['Region']).toLowerCase().trim().replace(/\s+/g, '-');
            
            // Handle edge cases to match our HTML routing
            if (rawRegion === 'caribe' || rawRegion === 'caribbean') rawRegion = 'caribbean';

            return {
                notionPageId: page.id, 
                id: getText(props['Trip ID']),
                title: getText(props['Trip Name'] || props['Title']), 
                region: getText(props['Region']),
                safeRegion: rawRegion,
                category: getText(props['Category']),
                duration: getText(props['Duration']),
                countries: getText(props['Location'] || props['Location/Countries']),
                route: getText(props['Route']),
                experiences: getText(props['Experiences']) || "Exclusive private tours, VIP access, curated luxury",
                hotels: getText(props['Hotels']),
                image: getText(props['Image URL']),
                slug: cleanSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
            };
        });

        console.log(`Found ${trips.length} approved trips ready to sync. Building pages...`);

        if (trips.length === 0) {
            console.log('No trips matched the "Ready to Sync" + Checkbox criteria. Exiting cleanly.');
            return;
        }

        const templatePath = path.join(__dirname, 'trip-template.html');
        if (!fs.existsSync(templatePath)) {
            console.error("❌ trip-template.html not found! Make sure it is in the root directory.");
            process.exit(1);
        }
        const template = fs.readFileSync(templatePath, 'utf-8');

        for (const trip of trips) {
            // 3. BUILD CORRECT FOLDER PATH
            // Outputs to: /travel/{region}/{slug}/index.html
            // This perfectly matches your "globalmix.network/travel/..." URLs
            const dirPath = path.join(__dirname, 'travel', trip.safeRegion, trip.slug);
            
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // Inject data into template
            let newHtml = template
                .replace(/{{TITLE}}/g, trip.title)
                .replace(/{{TRIP_JSON_DATA}}/g, JSON.stringify(trip));

            fs.writeFileSync(path.join(dirPath, 'index.html'), newHtml);
            console.log(`✅ Created: /travel/${trip.safeRegion}/${trip.slug}/index.html`);

            // Update Notion Status to "Live"
            try {
                await notion.pages.update({
                    page_id: trip.notionPageId,
                    properties: {
                        'Status': {
                            status: { name: 'Live' }
                        }
                    }
                });
                console.log(`   └─ Status updated to "Live" in Notion.`);
            } catch (statusError) {
                console.log(`   └─ ⚠️ Could not update status in Notion. Error: ${statusError.message}`);
            }
        }

        console.log('🎉 Build complete! All static pages generated and Notion is updated.');

    } catch (error) {
        console.error("❌ Error fetching from Notion:", error.message);
        process.exit(1); 
    }
}

generateSite();
