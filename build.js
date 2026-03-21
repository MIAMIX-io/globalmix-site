const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// Initialize Notion Client
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

// 🆕 Helper function to convert Notion blocks into styled HTML
function convertBlocksToHtml(blocks) {
    let html = '';
    
    for (const block of blocks) {
        switch(block.type) {
            case 'paragraph':
                const pText = block.paragraph.rich_text.map(t => t.plain_text).join('');
                if (pText.trim() === '') {
                    html += `<br/>`; // Handle empty lines
                } else {
                    html += `<p class="text-gray-600 font-light leading-relaxed mb-6 text-lg">${pText}</p>`;
                }
                break;
            case 'heading_1':
                const h1Text = block.heading_1.rich_text.map(t => t.plain_text).join('');
                html += `<h2 class="text-4xl font-serif text-gray-900 mt-12 mb-6">${h1Text}</h2>`;
                break;
            case 'heading_2':
                const h2Text = block.heading_2.rich_text.map(t => t.plain_text).join('');
                html += `<h3 class="text-3xl font-serif text-gray-900 mt-10 mb-4">${h2Text}</h3>`;
                break;
            case 'heading_3':
                const h3Text = block.heading_3.rich_text.map(t => t.plain_text).join('');
                html += `<h4 class="text-2xl font-serif text-gray-900 mt-8 mb-3">${h3Text}</h4>`;
                break;
            case 'bulleted_list_item':
                const liText = block.bulleted_list_item.rich_text.map(t => t.plain_text).join('');
                html += `<li class="ml-6 list-disc text-gray-600 mb-3 leading-relaxed">${liText}</li>`;
                break;
            case 'numbered_list_item':
                const numText = block.numbered_list_item.rich_text.map(t => t.plain_text).join('');
                html += `<li class="ml-6 list-decimal text-gray-600 mb-3 leading-relaxed">${numText}</li>`;
                break;
            case 'quote':
                const quoteText = block.quote.rich_text.map(t => t.plain_text).join('');
                html += `<blockquote class="border-l-4 border-[#C5A059] pl-6 py-2 my-8 text-xl italic font-serif text-gray-800 bg-gray-50/50 rounded-r-lg">"${quoteText}"</blockquote>`;
                break;
            // You can add more cases here for images or videos later if needed!
        }
    }
    
    // Wrap lists in ul/ol tags if needed, but modern browsers render consecutive <li> fine.
    return html;
}

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
                    { property: 'Sync to GitHub', checkbox: { equals: true } },
                    { property: 'Status', status: { equals: 'Ready to Sync' } }
                ]
            }
        });

        // Parse standard properties
        const trips = response.results.map(page => {
            const props = page.properties;
            
            let rawSlug = getText(props['Slug']);
            if (rawSlug !== "N/A" && rawSlug.includes('/')) {
                rawSlug = rawSlug.split('/').pop(); 
            }
            const cleanSlug = rawSlug !== "N/A" ? rawSlug : getText(props['Trip Name'] || props['Title']).split(' ')[0];

            let rawRegion = getText(props['Region']).toLowerCase().trim().replace(/\s+/g, '-');
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
                experiences: getText(props['Experiences']),
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
            // 🆕 FETCH THE INNER PAGE BLOCKS FROM NOTION
            console.log(`   └─ Fetching detailed page content for: ${trip.title}`);
            const blocksResponse = await notion.blocks.children.list({
                block_id: trip.notionPageId,
                page_size: 100 // Adjust if you have extremely long pages
            });
            
            // Convert blocks to styled HTML and attach it to the trip object
            trip.pageContentHtml = convertBlocksToHtml(blocksResponse.results);

            const dirPath = path.join(__dirname, 'travel', trip.safeRegion, trip.slug);
            
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // Inject data into template (using safe stringify to prevent HTML breakages inside JSON)
            let newHtml = template
                .replace(/{{TITLE}}/g, trip.title)
                .replace(/{{TRIP_JSON_DATA}}/g, JSON.stringify(trip).replace(/</g, '\\u003c'));

            fs.writeFileSync(path.join(dirPath, 'index.html'), newHtml);
            console.log(`✅ Created: /travel/${trip.safeRegion}/${trip.slug}/index.html`);

            // Update Notion Status to "Live"
            try {
                await notion.pages.update({
                    page_id: trip.notionPageId,
                    properties: { 'Status': { status: { name: 'Live' } } }
                });
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
