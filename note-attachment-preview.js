/* Local-only attachment preview engine. Uploaded bytes never leave the browser for preview. */
(function (root) {
  'use strict';

  const MAX_ARCHIVE_ENTRIES = 1000;
  const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;
  const MAX_TEXT_BYTES = 2 * 1024 * 1024;
  const TEXT_EXTENSIONS = new Set(['txt','md','markdown','csv','tsv','json','xml','yaml','yml','toml','ini','log','js','mjs','cjs','ts','tsx','jsx','css','scss','html','htm','svg','sql','py','java','c','h','cpp','cs','go','rs','sh','bat','ps1','php','rb','swift','kt','dart','ipynb','rtf']);
  const IMAGE_TYPES = new Set(['image/png','image/jpeg','image/gif','image/webp','image/avif','image/bmp','image/x-icon','image/vnd.microsoft.icon']);
  const AUDIO_EXTENSIONS = new Set(['mp3','wav','ogg','oga','m4a','aac','flac','opus','aiff','mid','midi']);
  const VIDEO_EXTENSIONS = new Set(['mp4','webm','mov','m4v','mkv','avi','mpeg','mpg','3gp','ogv']);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function extOf(name) { return (String(name || '').split('.').pop() || '').toLowerCase(); }
  function prettyBytes(size) {
    if (!Number.isFinite(size)) return 'Unknown size';
    if (size < 1024) return size + ' B';
    const units = ['KB','MB','GB','TB']; let n = size / 1024, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 10 ? 1 : 2) + ' ' + units[i];
  }
  function panel(container, title, description) {
    const wrap = el('section', 'w-full h-full min-h-0 overflow-auto p-4 md:p-6 space-y-3');
    wrap.append(el('h3', 'text-sm font-semibold text-main', title));
    if (description) wrap.append(el('p', 'text-xs text-muted', description));
    container.replaceChildren(wrap);
    return wrap;
  }
  function code(container, value, label) {
    const wrap = el('div', 'w-full min-w-0 space-y-2');
    if (label) wrap.append(el('div', 'text-xs font-medium text-muted', label));
    const pre = el('pre', 'w-full max-h-[65vh] overflow-auto rounded-xl border border-muted bg-main p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-main');
    pre.textContent = value;
    wrap.append(pre); container.append(wrap);
  }
  function addMetadata(container, file, mime, kind) {
    const grid = el('dl', 'grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs');
    [['File name',file.name || 'Attachment'],['Format',kind],['MIME type',mime || 'Not declared'],['File size',prettyBytes(file.size)],['Last modified',file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Not available']].forEach(([k,v]) => {
      const item = el('div','rounded-lg border border-muted bg-main p-2');
      item.append(el('dt','text-muted',k),el('dd','mt-1 break-all text-main font-medium',String(v)));
      grid.append(item);
    });
    container.append(grid);
  }
  function bytesToHex(bytes, limit) {
    const view = bytes.subarray(0, limit || 512), lines = [];
    for (let i=0;i<view.length;i+=16) {
      const part = view.subarray(i,i+16);
      const hex = Array.from(part, b=>b.toString(16).padStart(2,'0')).join(' ').padEnd(47,' ');
      const ascii = Array.from(part, b=>b>=32&&b<=126?String.fromCharCode(b):'.').join('');
      lines.push(i.toString(16).padStart(8,'0')+'  '+hex+'  '+ascii);
    }
    return lines.join('\n');
  }
  function decodeText(bytes) {
    try {
      const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
      const sample = text.slice(0, 4000);
      const printable = Array.from(sample).filter(ch => ch === '\n' || ch === '\r' || ch === '\t' || ch >= ' ').length;
      return sample.length && printable / sample.length > 0.88 ? text : null;
    } catch (_) { return null; }
  }
  function inspect(container, file, mime, kind, bytes) {
    const wrap = panel(container, 'File inspector', 'A safe in-app inspection is available even when this format has no dedicated renderer. The original file is unchanged.');
    addMetadata(wrap,file,mime,kind);
    const text = decodeText(bytes);
    if (text !== null) code(wrap,text.slice(0,MAX_TEXT_BYTES),'Readable content' + (text.length > MAX_TEXT_BYTES ? ' (first 2 MB)' : ''));
    code(wrap,bytesToHex(bytes,1024),'Binary preview · first 1 KB');
  }
  async function readZip(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = Math.max(0,bytes.length-65557); i <= bytes.length-22; i++) {
      if (view.getUint32(i,true) === 0x06054b50) eocd = i;
    }
    if (eocd < 0) throw new Error('ZIP directory not found');
    const count = Math.min(view.getUint16(eocd+10,true),MAX_ARCHIVE_ENTRIES);
    let offset = view.getUint32(eocd+16,true), total = 0;
    const entries = [];
    for (let i=0;i<count && offset+46<=bytes.length;i++) {
      if (view.getUint32(offset,true)!==0x02014b50) break;
      const method=view.getUint16(offset+10,true), compressed=view.getUint32(offset+20,true), expanded=view.getUint32(offset+24,true);
      const nameLen=view.getUint16(offset+28,true), extraLen=view.getUint16(offset+30,true), commentLen=view.getUint16(offset+32,true), local=view.getUint32(offset+42,true);
      const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLen));
      entries.push({name,method,compressed,expanded,local});
      total += expanded;
      offset += 46+nameLen+extraLen+commentLen;
    }
    return {bytes,view,entries,total,async extract(entry) {
      if (entry.expanded > MAX_EXPANDED_BYTES || entry.compressed > bytes.length) throw new Error('This entry exceeds the safe preview limit.');
      const p=entry.local;
      if (view.getUint32(p,true)!==0x04034b50) throw new Error('Invalid ZIP entry');
      const start=p+30+view.getUint16(p+26,true)+view.getUint16(p+28,true);
      const compressed=bytes.slice(start,start+entry.compressed);
      if (entry.method===0) return compressed;
      if (entry.method!==8 || typeof DecompressionStream==='undefined') throw new Error('This compression method is not supported by this browser.');
      const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const result=new Uint8Array(await new Response(stream).arrayBuffer());
      if (result.length>MAX_EXPANDED_BYTES) throw new Error('Expanded preview exceeds the safe size limit.');
      return result;
    }};
  }
  function xmlDoc(bytes) { return new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml'); }
  function xmlTexts(doc, selector) {
    return Array.from(doc.getElementsByTagName(selector)).map(n=>n.textContent || '').filter(Boolean);
  }
  async function officePreview(container, file, kind, zip) {
    const wrap=panel(container,kind+' preview','Rendered locally from the document package. Macros and embedded scripts are not executed.');
    addMetadata(wrap,file,file.type,kind);
    if (kind==='Word document') {
      const entry=zip.entries.find(x=>x.name==='word/document.xml');
      if (!entry) throw new Error('The main Word document part is missing.');
      const doc=xmlDoc(await zip.extract(entry));
      const paragraphs=Array.from(doc.getElementsByTagName('w:p')).map(p=>Array.from(p.getElementsByTagName('w:t')).map(t=>t.textContent||'').join('')).filter(Boolean);
      code(wrap,paragraphs.join('\n\n') || 'No readable paragraph text was found.','Document text');
    } else if (kind==='PowerPoint presentation') {
      const slides=zip.entries.filter(x=>/^ppt\/slides\/slide\d+\.xml$/.test(x.name)).sort((a,b)=>Number(a.name.match(/slide(\d+)/)[1])-Number(b.name.match(/slide(\d+)/)[1]));
      if (!slides.length) throw new Error('No presentation slides were found.');
      for (let i=0;i<slides.length;i++) {
        const doc=xmlDoc(await zip.extract(slides[i]));
        const texts=xmlTexts(doc,'a:t');
        const slide=el('article','rounded-xl border border-muted bg-main p-4 space-y-2');
        slide.append(el('h4','text-xs font-semibold text-muted','Slide '+(i+1)));
        slide.append(el('p','text-sm text-main whitespace-pre-wrap',texts.join(' ') || '(No text on this slide)'));
        wrap.append(slide);
      }
    } else if (kind==='Excel workbook') {
      const sharedEntry=zip.entries.find(x=>x.name==='xl/sharedStrings.xml');
      const shared=sharedEntry ? Array.from(xmlDoc(await zip.extract(sharedEntry)).getElementsByTagName('si')).map(si=>Array.from(si.getElementsByTagName('t')).map(t=>t.textContent||'').join('')) : [];
      const sheets=zip.entries.filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x.name)).sort((a,b)=>Number(a.name.match(/sheet(\d+)/)[1])-Number(b.name.match(/sheet(\d+)/)[1]));
      if (!sheets.length) throw new Error('No workbook sheets were found.');
      for (let i=0;i<sheets.length;i++) {
        const doc=xmlDoc(await zip.extract(sheets[i]));
        const rows=Array.from(doc.getElementsByTagName('row')).map(row=>Array.from(row.getElementsByTagName('c')).map(cell=>{
          const value=cell.getElementsByTagName('v')[0]?.textContent || '';
          return cell.getAttribute('t')==='s' ? (shared[Number(value)] || '') : (cell.getElementsByTagName('is')[0]?.textContent || value);
        }));
        const table=el('div','overflow-auto rounded-xl border border-muted');
        const tableEl=el('table','w-full text-xs border-collapse');
        rows.slice(0,500).forEach(row=>{
          const tr=el('tr','border-b border-muted');
          row.slice(0,40).forEach(value=>tr.append(el('td','px-2 py-1.5 align-top text-main whitespace-pre-wrap',value)));
          tableEl.append(tr);
        });
        table.append(tableEl); wrap.append(el('h4','text-xs font-semibold text-muted','Sheet '+(i+1)),table);
      }
    }
  }
  async function render(options) {
    const {container,blob,name,mimeType,objectUrl}=options;
    const ext=extOf(name), mime=mimeType || blob.type || 'application/octet-stream';
    const bytes=new Uint8Array(await blob.slice(0,Math.min(blob.size,MAX_TEXT_BYTES)).arrayBuffer());
    const kind = ext==='pdf'||mime==='application/pdf'?'PDF document':
      ['docx'].includes(ext)?'Word document':['xlsx'].includes(ext)?'Excel workbook':['pptx'].includes(ext)?'PowerPoint presentation':
      ['zip'].includes(ext)||mime.includes('zip')?'ZIP archive':
      mime.startsWith('image/')?'Image':mime.startsWith('audio/')?'Audio':mime.startsWith('video/')?'Video':
      ['woff','woff2','ttf','otf'].includes(ext)?'Font':(['stl','obj','gltf','glb','fbx','3ds'].includes(ext)?'3D model':'File inspector');
    if (IMAGE_TYPES.has(mime) || ['png','jpg','jpeg','gif','webp','avif','bmp','ico'].includes(ext)) {
      const img=el('img','max-w-full max-h-full object-contain p-3'); img.alt=name; img.src=objectUrl; container.replaceChildren(img); return;
    }
    if (ext==='svg' || mime==='image/svg+xml') {
      const source=await blob.text();
      const safe=root.DOMPurify ? root.DOMPurify.sanitize(source,{USE_PROFILES:{svg:true,svgFilters:true}}) : '';
      if (!safe) { inspect(container,blob,mime,'SVG (sanitized source unavailable)',bytes); return; }
      const safeUrl=URL.createObjectURL(new Blob([safe],{type:'image/svg+xml'}));
      const img=el('img','max-w-full max-h-full object-contain p-3'); img.alt=name; img.src=safeUrl; container.replaceChildren(img);
      img.addEventListener('load',()=>URL.revokeObjectURL(safeUrl),{once:true}); return;
    }
    if (kind==='Audio' || mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
      const wrap=panel(container,'Audio preview','Playback uses the browser media decoder.');
      const player=el('audio','w-full max-w-xl'); player.controls=true; player.preload='metadata'; player.src=objectUrl; wrap.append(player); return;
    }
    if (kind==='Video' || mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
      const wrap=panel(container,'Video preview','Playback uses the browser media decoder.');
      const player=el('video','max-w-full max-h-full'); player.controls=true; player.playsInline=true; player.preload='metadata'; player.src=objectUrl; wrap.append(player); return;
    }
    if (kind==='PDF document') {
      const frame=el('iframe','w-full h-full border-0 bg-white'); frame.title=name+' PDF preview'; frame.src=objectUrl; frame.setAttribute('sandbox','allow-scripts'); frame.referrerPolicy='no-referrer'; container.replaceChildren(frame); return;
    }
    if (['docx','xlsx','pptx'].includes(ext)) {
      try { const zip=await readZip(blob); await officePreview(container,blob,kind,zip); }
      catch(error) { inspect(container,blob,mime,kind+' · limited preview',bytes); const note=el('p','text-xs text-muted p-3','Structured preview could not be generated: '+error.message); container.firstElementChild?.append(note); }
      return;
    }
    if (ext==='zip' || mime.includes('zip')) {
      try {
        const zip=await readZip(blob), wrap=panel(container,'ZIP archive contents',zip.entries.length+' entries · expanded size '+prettyBytes(zip.total));
        addMetadata(wrap,blob,mime,'ZIP archive');
        const list=el('ul','divide-y divide-current/10 text-xs');
        zip.entries.forEach(entry=>list.append(el('li','py-2 flex items-center justify-between gap-3',entry.name+' · '+prettyBytes(entry.expanded))));
        wrap.append(list);
      } catch(error) { inspect(container,blob,mime,'ZIP archive · limited preview',bytes); }
      return;
    }
    if (['woff','woff2','ttf','otf'].includes(ext)) {
      const wrap=panel(container,'Font preview','This font is loaded only in this page for the specimen below.');
      addMetadata(wrap,blob,mime,'Font file');
      try {
        const fontName='MemoryPreviewFont'+Date.now();
        const fontUrl=URL.createObjectURL(blob);
        const face=new FontFace(fontName,'url('+fontUrl+')');
        await face.load(); document.fonts.add(face);
        const specimen=el('div','rounded-xl border border-muted bg-main p-5 text-main text-2xl break-words');
        specimen.style.fontFamily=fontName; specimen.textContent='The quick brown fox jumps over the lazy dog. 0123456789';
        wrap.append(specimen);
        specimen.addEventListener('DOMNodeRemoved',()=>{document.fonts.delete(face);URL.revokeObjectURL(fontUrl);},{once:true});
      } catch(error) { code(wrap,'Font could not be loaded: '+error.message); }
      return;
    }
    if (TEXT_EXTENSIONS.has(ext) || mime.startsWith('text/')) {
      const wrap=panel(container,'Text preview','Displayed as text; uploaded markup and scripts are never executed.');
      addMetadata(wrap,blob,mime,'Text / source file');
      let text=await blob.slice(0,MAX_TEXT_BYTES).text();
      if (ext==='json') { try { text=JSON.stringify(JSON.parse(text),null,2); } catch (_) {} }
      code(wrap,text+(blob.size>MAX_TEXT_BYTES?'\n\n[Preview truncated at 2 MB]':''),'File content'); return;
    }
    if (['doc','xls','ppt','rar','7z','gz','tar','bz2','xz','exe','dll','msi','apk','dmg','iso','bin','dat','stl','obj','gltf','glb','fbx','3ds'].includes(ext)) {
      inspect(container,blob,mime,kind,bytes); return;
    }
    inspect(container,blob,mime,kind,bytes);
  }

  root.MemoryAttachmentPreview = Object.freeze({ render, prettyBytes });
})(window);
