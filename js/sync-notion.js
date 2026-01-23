const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function syncPages() {
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
    const language = props['Language'].select?.name;
    
    if (!website) {
      console.log(`⚠️  Skipping "${title}" - no website assigned`);
      continue;
    }
    
    // Fetch page content
    const blocks = await notion.blocks.children.list({
      block_id: page.id,
      page_size: 100
    });
    
    const markdown = convertBlocksToMarkdown(blocks.results);
    const frontmatter = generateFrontmatter(props);
    
    // Write file
    const filepath = path.join('content', website, `${slug}.md`);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, `${frontmatter}\n\n${markdown}`);
    
    // Update sync timestamp
    await notion.pages.update({
      page_id: page.id,
      properties: {
        'Last Synced to GitHub': {
          date: { start: new Date().toISOString() }
        }
      }
    });
    
    console.log(`✓ Synced "${title}" → ${website}`);
  }
}

function generateFrontmatter(props) {
  const meta = {
    title: props['Page Title'].title[0]?.plain_text,
    description: props['Meta Description'].rich_text[0]?.plain_text,
    date: props['Publish Date'].date?.start,
    tags: props['Tags'].multi_select.map(t => t.name),
    contentType: props['Content Type'].select?.name,
    language: props['Language'].select?.name
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

function convertBlocksToMarkdown(blocks) {
  return blocks.map(block => {
    switch(block.type) {
      case 'paragraph':
        return block.paragraph.rich_text.map(t => t.plain_text).join('');
      case 'heading_1':
        return '# ' + block.heading_1.rich_text.map(t => t.plain_text).join('');
      case 'heading_2':
        return '## ' + block.heading_2.rich_text.map(t => t.plain_text).join('');
      case 'heading_3':
        return '### ' + block.heading_3.rich_text.map(t => t.plain_text).join('');
      case 'bulleted_list_item':
        return '- ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join('');
      case 'numbered_list_item':
        return '1. ' + block.numbered_list_item.rich_text.map(t => t.plain_text).join('');
      default:
        return '';
    }
  }).filter(Boolean).join('\n\n');
}

syncPages().catch(console.error);
