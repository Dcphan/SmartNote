// main.js - plain JavaScript version
// Make sure cytoscape script is included in index.html (we use CDN).

/**
 * Paste your graphData JSON below (I used your JSON, trimmed to fit).
 * If you prefer to load graphData from a separate file, swap this for a fetch.
 */
const graphData = {
  "nodes": [
    {
      "id": "class_C_Programming_Concepts",
      "label": "C Programming Concepts",
      "type": "class",
      "summary": "Core topics for C and C++: pointers, memory, arrays, file I/O, compilation, and functions.",
      "extensions": []
    },
    {
      "id": "getline",
      "label": "getline()",
      "type": "topic",
      "summary": "getline reads a line and often requires passing a pointer-to-pointer so the function can allocate/return a buffer dynamically.",
      "extensions": [
        "Pointer is a variable that stores an address",
        "Without a double pointer, getline() can’t do its job.",
        "Getline creates a copy of the target",
        "It dynamically allocates and reads the text",
        "Without 2x pointer, target can’t receive the dynamically allocated"
      ]
    },
    {
      "id": "file_io",
      "label": "File I/O",
      "type": "topic",
      "summary": "File I/O uses file pointers to open and read/write files using functions like fscanf and fprintf.",
      "extensions": [
        "Work with File I/O in C, we need to work with file pointers",
        "Create File Pointer",
        "Open File",
        "Use fscanf / fprintf"
      ]
    },
    {
      "id": "FILE_Pointer",
      "label": "FILE Pointer",
      "type": "topic",
      "summary": "FILE * declares a file pointer; fopen(path, mode) opens a file and the mode directs read/write behavior.",
      "extensions": [
        "FILE * <Identifier>; // The * indicates that the variable is a pointer",
        "Opening the File: fopen(<path>, <directives>)",
        "Directive tells the pointer what to do"
      ]
    },
    {
      "id": "cxx_file_handling",
      "label": "C++ File Handling",
      "type": "topic",
      "summary": "C++ offers stream-based file handling via ifstream and ofstream for input/output file operations.",
      "extensions": [
        "Ifstream and ofstream"
      ]
    },
    {
      "id": "compilation",
      "label": "C/C++ Compilation",
      "type": "topic",
      "summary": ".h files collect forward declarations and prototypes for organization; .o files are compiled object files not linked into an executable.",
      "extensions": [
        ".h files allow us to collect forward declarations to keep the code organized",
        "h files are 'library' files that allow us to collect prototypes together for easy reuse and compiler information",
        "The .o file is essentially compiled code that doesn’t have enough information to run by itself and is therefore not executable"
      ]
    },
    {
      "id": "memory",
      "label": "Memory",
      "type": "topic",
      "summary": "Memory model includes stack and heap; registers are small, faster hardware storage and the compiler may honor the register hint.",
      "extensions": [
        "We have access to 3 parts of the RAM: Stack, Heap",
        "Registers are faster than RAM",
        "Registers are a physical component in the hardware used for shuffling data and operations at a low level.",
        "The keyword register suggests to the compiler that the variable should be in the Register, but it's not mandatory"
      ]
    },
    {
      "id": "pointer",
      "label": "Pointer",
      "type": "topic",
      "summary": "A pointer is a variable that stores an address and can itself be pointed to by another pointer.",
      "extensions": [
        "A variable contains: Value, Location, Address, Name",
        "Pointers are also variables that store the addresses of another variable.",
        "There could be a pointer that stores another pointer"
      ]
    },
    {
      "id": "structure",
      "label": "Structure",
      "type": "topic",
      "summary": "A structure groups related data fields into one compound type, useful for organizing related values.",
      "extensions": [
        "Structure is a container that can hold a bunch of things.",
        "Used to organize related data into a neat package.",
        "Essentially a precursor to Object Orientation."
      ]
    }
  ],
  "edges": [
    { "from": "class_C_Programming_Concepts", "to": "getline" },
    { "from": "class_C_Programming_Concepts", "to": "file_io" },
    { "from": "class_C_Programming_Concepts", "to": "FILE_Pointer" },
    { "from": "class_C_Programming_Concepts", "to": "cxx_file_handling" },
    { "from": "class_C_Programming_Concepts", "to": "compilation" },
    { "from": "class_C_Programming_Concepts", "to": "memory" },
    { "from": "class_C_Programming_Concepts", "to": "pointer" },
    { "from": "class_C_Programming_Concepts", "to": "structure" }
  ]
};


// ---------- Helpers ----------
function makeElements(useExtensionNodes) {
  const els = [];

  // Add main nodes
  for (const n of graphData.nodes) {
    els.push({
      data: {
        id: n.id,
        label: n.label,
        summary: n.summary || "",
        extensions: n.extensions || [],
        type: n.type || "topic",
      }
    });

    // If rendering extensions as nodes, add them as small children
    if (useExtensionNodes && Array.isArray(n.extensions) && n.extensions.length) {
      n.extensions.forEach((ext, i) => {
        const extId = `${n.id}::ext::${i}`;
        els.push({
          data: {
            id: extId,
            label: `ex${i+1}`,
            summary: ext,
            type: "extension",
            parentTopicId: n.id
          }
        });
        // edge from topic -> extension node
        els.push({ data: { id: `e_${n.id}_${extId}`, source: n.id, target: extId } });
      });
    }
  }

  // Add original edges (topic structure)
  graphData.edges.forEach((e, idx) => {
    els.push({ data: { id: `edge_${idx}`, source: e.from, target: e.to } });
  });

  return els;
}


// ---------- Init Cytoscape ----------
let cy = null;
let useExtensionNodes = false;
let minimalView = true;

function render() {
  const extToggle = document.getElementById("extAsNodes");
  useExtensionNodes = extToggle.checked;
  minimalView = document.getElementById("minimalView").checked;

  if (cy) {
    cy.destroy();
    cy = null;
  }

  const elements = makeElements(useExtensionNodes);

  cy = cytoscape({
    container: document.getElementById("cy"),
    elements: elements,
    style: [
      { selector: "node[type='class']", style: { "background-color": "#0f172a", label: "data(label)", color: "#fff", "text-valign":"center", "text-halign":"center", "font-size":"14px", "width":"label", "padding":"12px" } },
      { selector: "node[type='topic']", style: { "background-color": "#059669", label: "data(label)", color:"#fff", "text-valign":"center","text-halign":"center","font-size":"12px","width":"label","padding":"8px" } },
      { selector: "node[type='extension']", style: { "background-color": "#f8fafc", "border-width": 1, "border-color":"#94a3b8", label: "data(label)", "font-size":"10px","width":"20","height":"20","text-valign":"center","text-halign":"center","color":"#111" } },
      { selector: "edge", style: { "curve-style":"bezier","target-arrow-shape":"triangle","line-color":"#94a3b8","target-arrow-color":"#94a3b8","width":2 } },
      { selector: ":selected", style: { "overlay-opacity": 0, "border-width": 3, "border-color":"#f59e0b" } }
    ],
    layout: {
      name: useExtensionNodes ? "concentric" : "breadthfirst",
      padding: 20,
      concentric: function(node){ return node.data('type') === 'class' ? 1000 : (node.data('type') === 'topic' ? 500 : 200); }
    },
    wheelSensitivity: 0.2,
    userZoomingEnabled: true
  });

  // If minimal view and extension nodes exist, hide them
  if (minimalView) {
    cy.nodes().forEach(n => {
      if (n.data("type") === "extension") n.style("display", "none");
    });
    // optionally reduce edge opacity
    cy.edges().style("opacity", 0.9);
  }

  // Node click handler
  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    const data = node.data();
    // If extension node was clicked and ext as nodes is toggled, show extension as the main summary
    if (data.type === "extension") {
      showNodeDetails({ label: `Extension`, summary: data.summary, extensions: [] });
      // Also highlight the parent topic if available
      if (data.parentTopicId) {
        cy.$id(data.parentTopicId).select();
      } else {
        node.select();
      }
      return;
    }

    showNodeDetails(data);
    node.select();
  });

  // click on background to deselect
  cy.on("tap", (evt) => {
    if (evt.target === cy) {
      clearDetails();
      cy.elements().unselect();
    }
  });
}


// ---------- UI detail panel ----------
function showNodeDetails(data) {
  const title = document.getElementById("node-title");
  const summary = document.getElementById("node-summary");
  const list = document.getElementById("extensions-list");

  title.textContent = data.label || "Topic";
  summary.textContent = data.summary || "";
  list.innerHTML = "";

  const exts = Array.isArray(data.extensions) ? data.extensions : [];
  if (exts.length === 0 && data.type === "topic") {
    // fallback: if no extensions array present, treat summary as extension (rare)
  }
  if (exts.length === 0 && data.type === "class") {
    list.innerHTML = "<li><em>No extensions</em></li>";
    return;
  }
  if (exts.length === 0 && data.type === "topic") {
    list.innerHTML = "<li><em>No extensions</em></li>";
    return;
  }

  exts.forEach((ext) => {
    const li = document.createElement("li");
    li.textContent = ext;
    list.appendChild(li);
  });
}

function clearDetails() {
  document.getElementById("node-title").textContent = "Select a topic";
  document.getElementById("node-summary").textContent = "Click a node to see the concise main-note.";
  document.getElementById("extensions-list").innerHTML = "";
}


// ---------- Wire controls ----------
document.getElementById("extAsNodes").addEventListener("change", () => {
  render();
});
document.getElementById("minimalView").addEventListener("change", () => {
  render();
});
document.getElementById("resetLayout").addEventListener("click", () => {
  if (!cy) return;
  cy.layout({ name: document.getElementById("extAsNodes").checked ? "concentric" : "breadthfirst", padding: 20 }).run();
});

// promote first extension to main (demo action)
document.getElementById("promoteBtn").addEventListener("click", () => {
  const title = document.getElementById("node-title").textContent;
  if (!title || title === "Select a topic") { alert("Select a topic first."); return; }

  // find node by label
  const node = cy.nodes().filter(n => n.data("label") === title)[0];
  if (!node) { alert("Selected node not found."); return; }
  const exts = node.data("extensions") || [];
  if (!exts.length) { alert("No extensions to promote."); return; }

  // Replace summary with first extension locally
  node.data("summary", exts[0]);
  showNodeDetails({ label: node.data("label"), summary: node.data("summary"), extensions: exts });
  alert("Promoted first extension to main note (locally). Persist via your backend if desired.");
});


// ---------- Start ----------
render();
