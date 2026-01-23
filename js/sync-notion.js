const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');
const https = require('https'); // Needed to download images

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function syncPages() {
  console.log("🔄 Starting Sync...");
  
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        { property: 'Sync to GitHub', checkbox: { equals: true } },
        { property: 'Status', status: { equals: 'Published' } }
      ]
    }
  });

  for (const page of response.results) {
    const props = page.properties;
    const title = props['Page Title'].title[0]?.plain_text || 'untitled';
    const slug = props['URL Slug'].rich_text[0]?.plain_text || slugify(title);
    const website = props['Website'].select?.name;
    
    if (!website) {
      console.log(`⚠️  Skipping "${title}" - no website assigned`);
      continue;
    }

    // Create folder for post images
    const imageDir = path.join('images', 'posts', slug);
    if (fs.existsSync(imageDir)) {
        // Optional: Clean old images? For now, we just overwrite/add.
    } else {
        fs.mkdirSync(imageDir, { recursive: true });
    }

    // 1. Handle Cover Image
    let coverImage = '';
    if (props['Cover Image'] && props['Cover Image'].files.length > 0) {
        const fileObj = props['Cover Image'].files[0];
        const imageUrl = fileObj.file?.url || fileObj.external?.url;
        if (imageUrl) {
            const ext = getExtension(imageUrl);
            const filename = `cover${ext}`;
            await downloadImage(imageUrl, path.join(imageDir, filename));
            coverImage = `/images/posts/${slug}/${filename}`;
        }
    }

    // 2. Fetch page content
    const blocks = await notion.blocks.children.list({
      block_id: page.id,
      page_size: 100
    });
    
    // We pass the slug/directory so the function knows where to save inside-post images
    const markdown = await convertBlocksToMarkdown(blocks.results, slug, imageDir);
    const frontmatter = generateFrontmatter(props, coverImage);
    
    // Write file
    const filepath = path.join('content', website, `${slug}.md`);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, `${frontmatter}\n\n${markdown}`);
    
    console.log(`✓ Synced "${title}" → ${website}`);
  }
}

// Helper to download images
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {}); // Delete the file async. (But we don't check result)
            reject(err.message);
        });
    });
}

function getExtension(url) {
    // Simple extension extraction
    const cleanUrl = url.split('?')[0];
    const ext = path.extname(cleanUrl);
    return ext || '.jpg'; // Default to jpg if unknown
}

function generateFrontmatter(props, coverImage) {
  const meta = {
    layout: 'post', // Important for Jekyll
    title: props['Page Title'].title[0]?.plain_text,
    description: props['Meta Description'].rich_text[0]?.plain_text,
    date: props['Publish Date'].date?.start,
    tags: props['Tags'].multi_select.map(t => t.name),
    image: coverImage, // Adds the cover image to the post metadata
    author: props['Author'].rich_text[0]?.plain_text
  };
  
  return '---\n' + Object.entries(meta)
    .filter(([k, v]) => v)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n') + '\n---';
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function convertBlocksToMarkdown(blocks, slug, imageDir) {
  const output = [];
  
  for (const block of blocks) {
    switch(block.type) {
      case 'paragraph':
        output.push(block.paragraph.rich_text.map(t => t.plain_text).join(''));
        break;
      case 'heading_1':
        output.push('# ' + block.heading_1.rich_text.map(t => t.plain_text).join(''));
        break;
      case 'heading_2':
        output.push('## ' + block.heading_2.rich_text.map(t => t.plain_text).join(''));
        break;
      case 'heading_3':
        output.push('### ' + block.heading_3.rich_text.map(t => t.plain_text).join(''));
        break;
      case 'bulleted_list_item':
        output.push('- ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join(''));
        break;
        
      // --- NEW MEDIA HANDLERS ---
      
      case 'image':
        const imgObj = block.image;
        const imgUrl = imgObj.file?.url || imgObj.external?.url;
        const caption = imgObj.caption.length ? imgObj.caption[0].plain_text : "Image";
        
        if (imgUrl) {
            // Download the image
            const ext = getExtension(imgUrl);
            const filename = `${block.id}${ext}`; // Use block ID to make it unique
            const savePath = path.join(imageDir, filename);
            const publicPath = `/images/posts/${slug}/${filename}`;
            
            try {
                await downloadImage(imgUrl, savePath);
                output.push(`![${caption}](${publicPath})`);
            } catch (e) {
                console.error(`Failed to download image: ${e}`);
            }
        }
        break;

      case 'video':
        // Handle YouTube Embeds simply
        const vidUrl = block.video?.external?.url || block.video?.file?.url;
        if (vidUrl && vidUrl.includes('youtube.com')) {
             // Convert standard watch URL to embed
             const videoId = vidUrl.split('v=')[1]?.split('&')[0];
             if (videoId) {
                 output.push(`<iframe width="100%" height="400" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`);
             }
        }
        break;
        
      // --------------------------
    }
  }
  return output.join('\n\n');
}

syncPages().catch(console.error);
