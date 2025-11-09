const fileStore = [];
let currentFileId = null;
const fileListEl = document.getElementById('fileList');
const noFilesEl = document.getElementById('noFiles');
const currentTitleEl = document.getElementById('currentTitle');
const currentMetaEl = document.getElementById('currentMeta');
const markdownInput = document.getElementById('markdownInput');
const hierarchyView = document.getElementById('hierarchyView');
const graphView = document.getElementById('graphView');
const toggleViewBtn = document.getElementById('toggleViewBtn');
const renameBtn = document.getElementById('renameBtn');
const deleteBtn = document.getElementById('deleteBtn');

// Utility: create id
const makeId = () => 'f' + Date.now() + Math.floor(Math.random()*1000);

// Render file list
function refreshFileList() {
  fileListEl.innerHTML = '';
  if (fileStore.length === 0) {
    noFilesEl.style.display = 'block';
  } else {
    noFilesEl.style.display = 'none';
  }

  fileStore.forEach(f => {
    const row = document.createElement('div');
    row.className = 'file-item rounded-md p-2 cursor-pointer flex items-center gap-2 hover:bg-gray-50';
    row.dataset.fileid = f.id;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'flex-1 min-w-0 text-sm font-medium truncate';
    titleDiv.textContent = f.title;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'text-xs text-gray-400';
    timeDiv.textContent = new Date(f.updated).toLocaleString();

    row.appendChild(titleDiv);
    row.appendChild(timeDiv);

    row.addEventListener('click', () => selectFile(f.id));
    row.addEventListener('dblclick', () => {
      // Quick rename on double click
      const newTitle = prompt('Rename note', f.title);
      if (newTitle && newTitle.trim()) updateFileTitle(f.id, newTitle.trim());
    });

    if (f.id === currentFileId) row.classList.add('active');

    fileListEl.appendChild(row);
  });
}

function displayHierarchy(data) {
    const container = document.getElementById("hierarchyView");
    container.innerHTML = ""; // Clear existing placeholder

    // Create class title
    const classTitle = document.createElement("h2");
    classTitle.className = "text-xl font-semibold text-gray-800 mb-4";
    classTitle.textContent = data.name || "Untitled Class";
    container.appendChild(classTitle);

    // Topics
    const topics = data.topics || {};


    Object.entries(topics).forEach(([id, topicObject]) => {

    // Check if topicObject has the expected structure before proceeding
    if (!topicObject || !topicObject.title || !topicObject.notes) {
        console.error(`Skipping invalid topic data for ID: ${id}`);
        return; // Skip this iteration
    }

    // --- Topic Header ---

    // We use topicObject.title for the title text, NOT the key (id)
    const topicTitleText = topicObject.title;

    const topicDiv = document.createElement("div");
    topicDiv.className = "mb-4 border-b border-gray-200 pb-2";

    const topicTitle = document.createElement("h3");
    topicTitle.className = "text-lg font-medium text-sky-700";
    topicTitle.textContent = topicTitleText; // Use the actual title text
    topicDiv.appendChild(topicTitle);

    // --- Notes List ---

    // We use topicObject.notes, which is the array of notes
    const notesArray = topicObject.notes;

    const ul = document.createElement("ul");
    ul.className = "mt-2 list-disc list-inside text-gray-700 space-y-1";

    // Loop through the actual notes array
    notesArray.forEach(note => {
      const li = document.createElement("li");

      // Ensure the note content is treated as text (e.g., if note is an object, access its property)
      // Assuming 'note' itself is the string content:
      li.textContent = note.content;

      ul.appendChild(li);
    });

    topicDiv.appendChild(ul);
    container.appendChild(topicDiv);
  });
}

/**
 * Improved graph display: force-directed, draggable, zoom/pan, search, focus-on-click, centered modal.
 * Drop-in: call displayGraphImproved(apiData)
 *
 * Requires D3 v7 loaded (no SRI mismatch).
 */
function displayGraph(data) {
  // ---------- normalize same as before ----------
  const container = document.getElementById('graphView');
  if (!container) return console.error('#graphView not found');
  container.classList.remove('hidden');
  // remove previous artifacts
  container.querySelectorAll('svg, #graph-backdrop, #topic-modal, #graph-controls, #graph-search, #graph-hover-label').forEach(n => n.remove());

  const className = data.name || data.Class || `Class ${data.id || ''}`;
  const rawTopics = data.topics || data.Topics || {};
  // ordered keys if numeric

  const keys = Object.keys(rawTopics).sort((a,b)=>{
    const na=Number(a), nb=Number(b);
    if(!isNaN(na)&&!isNaN(nb)) return na-nb;
    return a.localeCompare(b);
  });

  const topicsMap = {};
  const topicNames = [];
  keys.forEach((k) => {
    const v = rawTopics[k];
    // label extraction
    let label = null;
    if (typeof v === 'string') label = String(k);
    else if (Array.isArray(v)) label = String(k);
    else if (v && typeof v === 'object') label = v.title || v.name || v.label || v.topic || v.heading || null;
    if (!label) {
      if (/^\d+$/.test(k)) {
        if (v && typeof v === 'object') {
          label = v.title || v.name || Object.values(v).find(x=>typeof x==='string') || `Topic ${k}`;
        } else label = `Topic ${k}`;
      } else label = String(k);
    }


    // notes extractio
    let notes = [];
    if (typeof v === 'string') notes = [v];
    else if (Array.isArray(v)) notes = v.map(it => (typeof it==='string'?it:JSON.stringify(it)));
    else if (v && typeof v === 'object') {
      if (Array.isArray(v.notes)) notes = v.notes;
      else if (Array.isArray(v.items)) notes = v.items;
      else if (Array.isArray(v.points)) notes = v.points;
      else if (Array.isArray(v.content)) notes = v.content;
      else if (typeof v.text === 'string') notes = [v.text];
      else notes = Object.keys(v).map(k2 => v[k2]).filter(val => typeof val === 'string');
    }



    if (notes.length===0) notes = ['(no notes)'];


    let finalLabel = label;
    let suffix = 1;
    while (topicsMap.hasOwnProperty(finalLabel)) finalLabel = `${label} (${suffix++})`;

    topicsMap[finalLabel] = notes;

    topicNames.push(finalLabel);
  });



  // ---------- SVG and layout params ----------
  const rect = container.getBoundingClientRect();
  const width = Math.max(720, rect.width || 900);
  const height = Math.max(480, rect.height || 520);

  const svg = d3.select(container).append('svg')
    .attr('id','notesGraph')
    .attr('width','100%')
    .attr('viewBox',`0 0 ${width} ${height}`)
    .style('height', `${height}px`)
    .style('display','block')
    .style('touch-action','none');

  // controls (search + layout + reset)
  const controls = document.createElement('div');
  controls.id = 'graph-controls';
  controls.style.position = 'absolute';
  controls.style.left = '16px';
  controls.style.top = '12px';
  controls.style.zIndex = 120;
  controls.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;background:white;padding:8px;border-radius:10px;border:1px solid rgba(148,163,184,0.08);box-shadow:0 6px 18px rgba(2,6,23,0.06);">
      <input id="graph-search" placeholder="Search topic..." style="padding:6px 10px;border-radius:8px;border:1px solid #e6eef8;width:220px;" />
      <button id="layoutToggle" style="padding:6px 10px;border-radius:8px;border:1px solid #e6eef8;background:#fff;cursor:pointer;">Switch to Ring</button>
      <button id="resetView" style="padding:6px 10px;border-radius:8px;border:1px solid #e6eef8;background:#fff;cursor:pointer;">Reset</button>
    </div>
  `;
  container.appendChild(controls);

  // zoomable group
  const zoomGroup = svg.append('g').attr('class','zoom-group');
  // background rect for catching events
  zoomGroup.append('rect').attr('width',width).attr('height',height).attr('fill','transparent');

  // nodes & links data
  const nodes = [{ id:'CLASS_CENTER', label: className, type:'class', fx: width/2, fy: height/2 }];
  topicNames.forEach((t, i) => nodes.push({ id: t, label: t, type:'topic' }));
  const links = topicNames.map(t => ({ source:'CLASS_CENTER', target: t }));

  // visual params
  const centerX = width/2, centerY = height/2;
  const defaultNodeR = topicNames.length > 40 ? 10 : (topicNames.length > 20 ? 14 : 18);
  const centerR = 48;

  // force simulation (strong center force, collision)
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(d => (d.target.type==='topic' ? 160 : 120)).strength(0.9))
    .force('charge', d3.forceManyBody().strength(-90))
    .force('center', d3.forceCenter(centerX, centerY))
    .force('collision', d3.forceCollide().radius(d => d.type==='class' ? centerR+6 : defaultNodeR+8))
    .alphaDecay(0.02);

  // draw links
  const linkG = zoomGroup.append('g').attr('class','links');
  const linkElems = linkG.selectAll('line').data(links).enter().append('line')
    .attr('stroke','#E2E8F0').attr('stroke-width',1.2).attr('opacity',0.9);

  // node group
  const nodeG = zoomGroup.append('g').attr('class','nodes');
  const nodeElems = nodeG.selectAll('g.node').data(nodes).enter().append('g')
    .attr('class','node')
    .style('cursor','pointer')
    .call(d3.drag()
      .on('start', (event,d) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event,d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event,d) => {
        if (!event.active) simulation.alphaTarget(0);
        // keep class node fixed at center, others released but positioned
        if (d.type==='class') { d.fx = centerX; d.fy = centerY; }
        else { /* keep d.fx/d.fy so user can rearrange */ }
      })
    );


  // circle and label for each node
  nodeElems.append('circle')
    .attr('r', d => d.type==='class' ? centerR : defaultNodeR)
    .attr('fill', d => d.type==='class' ? '#0EA5E9' : '#F8FAFC')
    .attr('stroke', d => d.type==='class' ? '#0369A1' : '#94A3B8')
    .attr('stroke-width', 1.2);

  // short labels (center uses full text, topics shortened)
  nodeElems.append('text')
    .attr('text-anchor','middle')
    .attr('dy', d => d.type==='class' ? '0.35em' : (defaultNodeR + 12) + 'px')
    .style('font-family','Inter, system-ui, sans-serif')
    .style('font-size', d => d.type==='class' ? '14px' : Math.max(10, 12 - (topicNames.length/20)) + 'px')
    .style('fill', d => d.type==='class' ? '#fff' : '#0F172A')
    .text(d => {
      if (d.type==='class') return d.label;
      const txt = d.label;
      if (txt.length > 14) return txt.slice(0,12) + '…';
      return txt;
    });

  // hover tooltip small
  const hover = d3.select(container).append('div').attr('id','graph-hover-label')
    .style('position','absolute').style('pointer-events','none').style('display','none')
    .style('background','rgba(255,255,255,0.98)').style('border','1px solid rgba(148,163,184,0.6)')
    .style('padding','6px 10px').style('border-radius','8px').style('box-shadow','0 6px 18px rgba(2,6,23,0.08)')
    .style('font-size','13px').style('z-index',110);

  nodeElems.on('mouseenter', function(event,d){
    if (d.type !== 'class') {
      // enlarge slightly
      d3.select(this).select('circle').transition().duration(120).attr('r', defaultNodeR + 5);
      const crect = container.getBoundingClientRect();
      hover.style('left', (event.clientX - crect.left + 12) + 'px').style('top', (event.clientY - crect.top + 6) + 'px').style('display','block').html(d.label);
    }
  }).on('mousemove', function(event){
    const crect = container.getBoundingClientRect();
    hover.style('left', (event.clientX - crect.left + 12) + 'px').style('top', (event.clientY - crect.top + 6) + 'px');
  }).on('mouseleave', function(){
    d3.select(this).select('circle').transition().duration(120).attr('r', d => d.type==='class' ? centerR : defaultNodeR);
    hover.style('display','none');
  });

  // click behavior: focus node and open modal for topics
  nodeElems.on('click', function(event,d){
    event.stopPropagation();
    if (d.type === 'topic') {

      focusNode(d);
      console.log(topicsMap);
      showModal(d.label, topicsMap[d.label] || []);
    } else {
      // center clicked - reset
      resetView();
    }
  });

  // simulation tick
  simulation.on('tick', () => {
    // constrain nodes inside bounds
    nodes.forEach(n => {
      if (n.x == null || n.y == null) return;
      const margin = 8;
      n.x = Math.max(margin, Math.min(width - margin, n.x));
      n.y = Math.max(margin, Math.min(height - margin, n.y));
    });

    linkElems.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

    nodeElems.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // ---------- zoom & pan ----------
  const zoom = d3.zoom().scaleExtent([0.5, 3]).on('zoom', (event) => {
    zoomGroup.attr('transform', event.transform);
  });
  svg.call(zoom);
  // reset view helper
  function resetView() {
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
    // optionally reheat simulation a bit
    simulation.alpha(0.3).restart();
  }
  document.getElementById('resetView').onclick = resetView;

  // layout toggle: switch between force and ring deterministic positions
  let usingForce = true;
  document.getElementById('layoutToggle').onclick = () => {
    usingForce = !usingForce;
    document.getElementById('layoutToggle').textContent = usingForce ? 'Switch to Ring' : 'Switch to Force';
    if (!usingForce) {
      // compute ring positions and freeze nodes
      const ringR = Math.min(width, height) / 2 - 120;
      const count = topicNames.length;
      topicNames.forEach((label, i) => {
        const node = nodes.find(n=>n.id===label);
        const angle = (i / count) * Math.PI * 2 - Math.PI/2;
        node.fx = centerX + Math.cos(angle) * ringR;
        node.fy = centerY + Math.sin(angle) * ringR;
      });
      // ensure center fixed
      nodes.find(n=>n.id==='CLASS_CENTER').fx = centerX; nodes.find(n=>n.id==='CLASS_CENTER').fy = centerY;
      simulation.alpha(0.5).restart();
    } else {
      // release topic nodes but keep center fixed
      nodes.forEach(n => { if (n.type==='topic') { n.fx = null; n.fy = null; } });
      nodes.find(n=>n.id==='CLASS_CENTER').fx = centerX; nodes.find(n=>n.id==='CLASS_CENTER').fy = centerY;
      simulation.alpha(0.5).restart();
    }
  };

  // ---------- focus node: center & zoom ----------
  function focusNode(node) {
    // center node in viewport and zoom in smoothly
    const transform = d3.zoomTransform(svg.node());
    const scale = 1.6;
    const x = node.x, y = node.y;
    const tx = width/2 - x * scale;
    const ty = height/2 - y * scale;
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
    // slight visual highlight
    nodeElems.selectAll('circle').attr('stroke-width', 1.2).attr('opacity', 1);
    nodeElems.filter(d=>d.id===node.id).select('circle').attr('stroke-width', 2.4);
  }

  // ---------- modal (centered big) ----------
  function createModalIfMissing() {
    if (document.getElementById('graph-backdrop')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'graph-backdrop';
    Object.assign(backdrop.style, { position:'absolute', left:0, top:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.25)', display:'none', zIndex:200 });
    container.appendChild(backdrop);

    const modal = document.createElement('div');
    modal.id = 'topic-modal';
    modal.className = 'bg-white rounded-lg shadow-xl p-6';
    Object.assign(modal.style, { position:'absolute', width:'min(880px,92%)', maxHeight:'84%', overflow:'auto', left:'50%', top:'50%', transform:'translate(-50%,-50%)', display:'none', zIndex:210 });
    container.appendChild(modal);

    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key==='Escape') closeModal(); });
  }

  function showModal(title, notes) {
    createModalIfMissing();
    const backdrop = document.getElementById('graph-backdrop');
    const modal = document.getElementById('topic-modal');
    const safe = s => (s==null?'':String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
    modal.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;">
          <h2 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">${safe(title)}</h2>
          <p style="margin:6px 0 0;color:#64748b;font-size:13px;">${notes.length} note${notes.length!==1?'s':''}</p>
        </div>
        <button id="close-topic-modal" aria-label="Close" style="background:transparent;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">✕</button>
      </div>
      <hr style="margin:12px 0;border:none;border-top:1px solid #e6eef8;" />
      <div style="font-size:15px;color:#0f172a;">
        ${notes.length ? `<ul style="padding-left:18px;line-height:1.6;margin:0 0 12px 0;list-style-type:disc;">${notes.map(n => `<li>${safe(n.content || n)}</li>`).join('')}</ul>` : '<p style="color:#94a3b8;margin:0;">• No notes</p>'}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button id="copy-topic-modal" style="padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;background:white;cursor:pointer;">Copy</button>
      </div>
    `;
    backdrop.style.display = 'block';
    modal.style.display = 'block';
    document.getElementById('close-topic-modal').onclick = closeModal;
    document.getElementById('copy-topic-modal').onclick = async () => {
      const txt = `${title}\n\n` + (notes.length ? notes.map((n,i)=>`${i+1}. ${n}`).join('\n') : '');
      try { await navigator.clipboard.writeText(txt); const btn = document.getElementById('copy-topic-modal'); btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent='Copy',1200); } catch(e){ alert('Copy failed'); }
    };
  }
  function closeModal() { const b=document.getElementById('graph-backdrop'); const m=document.getElementById('topic-modal'); if(b) b.style.display='none'; if(m) m.style.display='none'; }

  // clicking background hides hover
  svg.on('click', () => d3.select('#graph-hover-label')?.style('display','none'));

  // ---------- search box wiring ----------
  const searchInput = document.getElementById('graph-search');
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      // un-highlight
      nodeElems.selectAll('circle').attr('stroke', d => d.type==='class'?'#0369A1':'#94A3B8').attr('opacity',1);
      return;
    }
    // find best match by label substring
    const match = topicNames.find(t => t.toLowerCase().includes(q));
    nodeElems.selectAll('circle').attr('opacity', d => (d.type==='class'?1: (d.label.toLowerCase().includes(q) ? 1 : 0.25)));
    if (match) {
      const node = nodes.find(n => n.id === match);
      if (node) focusNode(node);
    }
  });

  // ---------- better cleanup on unload if needed ----------
  // return an API if caller wants to reset or destroy
  return {
    reset: resetView,
    focus: (topicLabel) => {
      const node = nodes.find(n => n.id === topicLabel);
      if (node) focusNode(node);
    },
    destroy: () => {
      simulation.stop();
      container.querySelectorAll('svg, #graph-backdrop, #topic-modal, #graph-controls, #graph-hover-label').forEach(n=>n.remove());
    }
  };
}

async function selectFile(id) { // <-- 3. Added 'async' keyword
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/class_hierarchy/${id}`);

        // 4. Check for HTTP status errors on the awaited 'response' object
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // 2. Await the json() call to get the parsed data
        const note_details = await response.json();

        // Call the display function with the actual data
        displayHierarchy(note_details);
        displayGraph(note_details);

    } catch (error) {
        // Handle network errors (e.g., server down) or HTTP status errors
        console.error("Failed to fetch or process hierarchy data:", error);
        // You might want to update the UI to show the error
        // displayError(error.message);
    }
}

// Minimal: fetch /api/classes and create notes
async function loadClassesAsNotes() {
try {
const res = await fetch('http://127.0.0.1:8000/api/classes', { credentials: 'same-origin' });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const classes = await res.json(); // expects [{id, name}]
// wipe current demo files (optional)
fileStore.length = 0;
for (const c of classes) {
  // use stable id so duplicates won't be created on repeated calls
  const id = c.id;
  fileStore.push({ id, title: c.name, content: `# ${c.name}\n\nImported class #${c.id}`, updated: Date.now() });
}
// show newest first (keep your existing ordering convention)
fileStore.sort((a,b) => b.updated - a.updated);
refreshFileList();
if (fileStore.length) selectFile(fileStore[0].id);
} catch (err) {
console.error('Failed to load classes:', err);
// keep demo files if you want
}
}

// Track the current state (start with hierarchy)
let showingHierarchy = true;

toggleViewBtn.addEventListener("click", () => {
  if (showingHierarchy) {
    // switch to graph view
    hierarchyView.classList.add("hidden");
    graphView.classList.remove("hidden");
    toggleViewBtn.textContent = "Graph View"; // change button name
  } else {
    // switch to hierarchy view
    graphView.classList.add("hidden");
    hierarchyView.classList.remove("hidden");
    toggleViewBtn.textContent = "Hierarchy View";
  }
  showingHierarchy = !showingHierarchy;
});

// Expose DOM API globally so other scripts or console can use
window.SmartNotes = {

};

loadClassesAsNotes();
// initial demo files

// Select the most recent file
if (fileStore.length) selectFile(fileStore[0].id);