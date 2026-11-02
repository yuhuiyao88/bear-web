// Google Scholar's CSV export is imported by its owner; no crawling is performed.
export function parseScholarCSV(csv){
 if(typeof csv!=='string'||csv.length>500000)throw new Error('Choose a CSV export smaller than 500 KB.');
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw new Error('CSV contains an unfinished quoted field.');row.push(field);if(row.some(Boolean))rows.push(row);
 const headers=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase()),title=headers.indexOf('title'),authors=headers.indexOf('authors'),year=headers.indexOf('year');
 if(title<0||authors<0)throw new Error('This export needs Title and Authors columns.');
 return rows.filter(r=>r[title]?.trim()).slice(0,50).map(r=>({title:r[title].trim().slice(0,500),authors:(r[authors]||'').slice(0,700),year:(r[year]||'').slice(0,4)}));
}
