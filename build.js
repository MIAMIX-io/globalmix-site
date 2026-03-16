const fs = require('fs');
const path = require('path');

// 1. Read your database (We assume you exported Notion to trips.json or fetched it via Notion API)
const rawData = fs.readFileSync('./trips.json', 'utf-8');
const trips = JSON.parse(rawData);

// 2. Read the master template
const template = fs.readFileSync('./trip-template.html', 'utf-8');

console.log(`Found ${trips.length} trips. Generating pages...`);

trips.forEach(trip => {
    // Format Region (e.g., "Latin America" -> "latinamerica")
    const safeRegion = trip.region.toLowerCase().replace(/\s+/g, '');
    
    // Grab the custom slug you created in Notion (e.g., "thailand")
    const safeSlug = trip.slug.toLowerCase().replace(/\s+/g, '-');

    // Define the path: e.g., ./asia/thailand
    const dirPath = path.join(__dirname, safeRegion, safeSlug);
    
    // Create the folders if they don't exist
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    // Inject data into template
    let newHtml = template
        .replace('{{TITLE}}', trip.title)
        .replace('{{TRIP_JSON_DATA}}', JSON.stringify(trip));

    // Write the index.html file into the new folder
    fs.writeFileSync(path.join(dirPath, 'index.html'), newHtml);
    
    console.log(`✅ Created: globalmix.network/${safeRegion}/${safeSlug}`);
});

console.log('Build complete! Ready for GitHub Pages deployment.');
