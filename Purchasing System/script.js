// ===== Supabase details =====
var SUPABASE_URL = "https://jfesufjixkyjbkccryws.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmZXN1ZmppeGt5amJrY2NyeXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NDAwMDgsImV4cCI6MjEwOTUxNjAwOH0.Sx06VTLVSTKGyo2uhe2yY0O8rV_GP2tGtX6BhMPpT6M";
// ============================

var sb = null, setupError = "";
try{
  if(!window.supabase) throw new Error("Supabase library did not load (check your internet connection).");
  if(SUPABASE_URL.indexOf("http") !== 0 || SUPABASE_KEY.indexOf("PASTE") === 0)
    throw new Error("Paste your Supabase URL and key at the top of script.js.");
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}catch(err){ setupError = err.message }

var entries = [], selected = {}, editingId = null, lastStoreKey = "";

// Which fields each category uses, in the order they appear on the form
var FIELDS = {
  "Civil":           ["material","brand","unit","store","price"],
  "Carpentry":       ["material","unit","dimension","thickness","grade","store","price"],
  "Wall/Ceiling":    ["material","unit","dimension","thickness","grade","store","price"],
  "Metal":           ["material","unit","dimension","thickness","grade","store","price"],
  "Consumables":     ["material","brand","unit","dimension","store","price"],
  "Paints/Plumbing": ["material","unit","brand","store","price"],
  "Tiles":           ["material","dimension","store","price"]
};
var TEXT_IDS = ["material","brand","unit","dimension","thickness","grade","store"];
var ALL_IDS = TEXT_IDS.concat(["price"]);

function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function fmtPrice(n){return Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
function titleCase(s){return String(s==null?"":s).toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g,function(m,a,b){return a+b.toUpperCase()})}
// measurements stay lowercase with spaces: 3.5 mm, 1/2 x 1/2 in, 4 x 8 ft, 6"
function measure(v){
  return v.toLowerCase().replace(/\s+/g," ")
    .replace(/(\d)\s*x\s*(?=[\d.\/])/g,"$1 x ")
    .replace(/(\d)\s*(mm|cm|in|ft|m)\b/g,"$1 $2");
}
// item = ALL CAPS, unit = lowercase, everything else = Title Case
function fmtVal(id,v){
  v = String(v==null?"":v).trim();
  if(id === "material") return v.toUpperCase();
  if(id === "unit") return v.toLowerCase();
  if(id === "thickness" || id === "dimension") return measure(v);
  return titleCase(v);
}
function norm(s){return String(s==null?"":s).toLowerCase().replace(/\s+/g," ").trim()}
function fmtDate(iso){var d=new Date(iso);return isNaN(d)?"":d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}

// ---------- Entry form ----------
function applyCategory(){
  var list = FIELDS[$("type").value] || ALL_IDS;
  ALL_IDS.forEach(function(id){
    var wrap = $(id).parentNode, k = list.indexOf(id);
    wrap.style.display = k < 0 ? "none" : "";
    wrap.style.order = k < 0 ? 0 : k;
  });
}
$("type").onchange = applyCategory;
applyCategory();

function clearForm(){ ALL_IDS.forEach(function(i){$(i).value=""}) }

function cancelEdit(){
  editingId = null;
  $("add").textContent = "Save entry";
  $("cancelEdit").hidden = true;
  $("msg").textContent = "";
  clearForm();
}

$("add").onclick = async function(){
  if(!sb){ $("msg").textContent = setupError; return }
  var e = {type:$("type").value}, list = FIELDS[e.type] || ALL_IDS;
  TEXT_IDS.forEach(function(id){ e[id] = list.indexOf(id) >= 0 ? fmtVal(id,$(id).value) : "" });
  e.price = parseFloat(parseFloat($("price").value).toFixed(2));
  if(!e.material || !e.store || isNaN(e.price)){ $("msg").textContent = "Item, store and price are required."; return }
  $("msg").textContent = "Saving...";
  var r;
  if(editingId){
    e.updated_at = new Date().toISOString();
    var orig = entries.filter(function(x){return x.id === editingId})[0];
    if(orig && Math.abs(Number(orig.price) - e.price) > 0.001){
      e.price_history = (Array.isArray(orig.price_history) ? orig.price_history : []).concat([{at:e.updated_at, from:Number(orig.price), to:e.price}]);
    }
    r = await sb.from("prices").update(e).eq("id", editingId);
  }else{
    r = await sb.from("prices").insert(e);
  }
  if(r.error){ $("msg").textContent = "Save failed: " + r.error.message; return }
  if(editingId){
    cancelEdit();
    await load();
    showList(true);
    $("listMsg").textContent = "Updated.";
  }else{
    clearForm();
    $("msg").textContent = "Saved.";
    load();
  }
};

$("cancelEdit").onclick = function(){ cancelEdit(); showList(true) };

// ---------- Loading ----------
async function load(){
  if(!sb){ $("msg").textContent = setupError; render(); return }
  var r = await sb.from("prices").select("*").order("created_at",{ascending:false});
  if(r.error){ $("msg").textContent = "Could not load: " + r.error.message; return }
  entries = r.data.map(function(d){ d.price = Number(d.price); return d });
  var ids = {}; entries.forEach(function(e){ids[e.id]=1});
  Object.keys(selected).forEach(function(k){ if(!ids[k]) delete selected[k] });
  render();
}

// ---------- Pricelist ----------
$("fCat").innerHTML = '<option value="">CATEGORY</option>' + Object.keys(FIELDS).map(function(c){return '<option>'+esc(c)+'</option>'}).join("");

function matches(e,q){
  var hay = norm([e.type,e.material,e.brand,e.unit,e.dimension,e.thickness,e.grade,e.store].join(" "));
  return norm(q).split(" ").filter(Boolean).every(function(t){
    var re = new RegExp("(^|[\\s])" + t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
    return re.test(hay);
  });
}
function gk(e){ return [e.material,e.dimension,e.thickness,e.grade,e.unit].map(norm).join("|") }

function fillStores(){
  var seen = {}, list = [];
  entries.forEach(function(e){ var k = norm(e.store); if(k && !seen[k]){ seen[k]=1; list.push(titleCase(e.store)) } });
  list.sort();
  var key = list.join("|");
  if(key === lastStoreKey) return;
  lastStoreKey = key;
  var cur = $("fStore").value;
  $("fStore").innerHTML = '<option value="">STORE</option>' + list.map(function(s){return '<option>'+esc(s)+'</option>'}).join("");
  $("fStore").value = cur;
}

function visibleRows(){
  var q = $("q").value.trim(), cat = $("fCat").value, st = norm($("fStore").value);
  if(!q && !cat && !st) return [];   // nothing searched yet: show nothing
  return entries.filter(function(e){
    return (!q || matches(e,q)) && (!cat || e.type === cat) && (!st || norm(e.store) === st);
  }).sort(function(a,b){ var x=gk(a), y=gk(b); return x<y?-1:x>y?1:a.price-b.price });
}

var HEAD = {material:"Item name",brand:"Brand",unit:"Unit",dimension:"Dimension",thickness:"Thickness",grade:"Grade / Schedule",store:"Store",price:"Price"};
var GENERAL = ["material","unit","brand","store","price"];


// Remarks: "Added <date>" or "Edited <date>", plus the price-change history
function remarksHtml(e){
  var out = e.updated_at ? "Edited " + fmtDate(e.updated_at) : "Added " + fmtDate(e.created_at);
  var h = Array.isArray(e.price_history) ? e.price_history : [];
  var today = fmtDate(new Date().toISOString());
  h.slice(-3).reverse().forEach(function(c){
    var d = fmtDate(c.at), up = c.to > c.from;
    out += '<br><span class="chg ' + (up ? "up" : "down") + (d === today ? " today" : "") + '">' +
           esc(d) + ": " + fmtPrice(c.from) + " → " + fmtPrice(c.to) + (up ? " ▲" : " ▼") + '</span>';
  });
  if(h.length > 3) out += '<br>+' + (h.length - 3) + " earlier change" + (h.length - 3 > 1 ? "s" : "");
  return out;
}

function render(){
  fillStores();
  var cat = $("fCat").value;
  var searched = !!($("q").value.trim() || cat || $("fStore").value);
  var cols = (cat && FIELDS[cat]) ? FIELDS[cat] : GENERAL;   // a chosen category shows all of its fields
  var rows = visibleRows();

  // only rows currently shown can stay ticked
  var shown = {}; rows.forEach(function(e){shown[e.id]=1});
  Object.keys(selected).forEach(function(k){ if(!shown[k]) delete selected[k] });

  var html = '<table class="plist"><thead><tr><th class="nop"></th>' +
    cols.map(function(id){return '<th'+(id==="material"?' class="l"':'')+'>'+HEAD[id]+'</th>'}).join("") +
    '<th>Remarks</th></tr></thead><tbody>';
  if(searched && !rows.length){
    html += '<tr><td colspan="'+(cols.length+2)+'" class="empty">No prices found.</td></tr>';
  }else{
    html += rows.map(function(e){
      return '<tr><td class="nop"><input type="checkbox" class="rowchk" data-id="'+e.id+'"'+(selected[e.id]?' checked':'')+'></td>' +
        cols.map(function(id){
          if(id === "price") return '<td>'+fmtPrice(e.price)+'</td>';
          if(id === "material"){
            var detail = cat ? "" : ["dimension","thickness","grade"].map(function(k){return fmtVal(k,e[k])}).filter(Boolean).join(" · ");
            return '<td class="l"><b>'+esc(fmtVal("material",e.material))+'</b>'+(detail?'<br><span class="sub">'+esc(detail)+'</span>':'')+'</td>';
          }
          return '<td>'+esc(fmtVal(id,e[id]))+'</td>';
        }).join("") +
        '<td class="sub">'+remarksHtml(e)+'</td></tr>';
    }).join("");
  }
  $("results").innerHTML = html + '</tbody></table>';
}

$("q").oninput = render;
$("fCat").onchange = render;
$("fStore").onchange = render;

$("results").onchange = function(ev){
  var t = ev.target;
  if(!t.classList || !t.classList.contains("rowchk")) return;
  if(t.checked) selected[t.getAttribute("data-id")] = true; else delete selected[t.getAttribute("data-id")];
  $("listMsg").textContent = "";
};

$("editBtn").onclick = function(){
  var ids = Object.keys(selected);
  if(ids.length !== 1){ $("listMsg").textContent = "Tick one item to edit."; return }
  var e = entries.filter(function(x){return String(x.id) === ids[0]})[0];
  if(!e){ return }
  editingId = e.id;
  var sel = $("type");
  if(!Array.prototype.some.call(sel.options,function(o){return o.value === e.type})) sel.appendChild(new Option(e.type,e.type));
  sel.value = e.type;
  applyCategory();
  TEXT_IDS.forEach(function(id){ $(id).value = e[id] || "" });
  $("price").value = e.price;
  $("add").textContent = "Update entry";
  $("cancelEdit").hidden = false;
  $("msg").textContent = "Editing: change the price or any field, then press Update entry.";
  showList(false);
  window.scrollTo(0,0);
};

$("delBtn").onclick = async function(){
  var ids = Object.keys(selected);
  if(!ids.length){ $("listMsg").textContent = "Tick the item(s) to delete."; return }
  if(!sb || !confirm("Delete " + ids.length + " selected item(s)?")) return;
  var r = await sb.from("prices").delete().in("id", ids.map(Number));
  if(r.error){ $("listMsg").textContent = "Delete failed: " + r.error.message; return }
  selected = {};
  $("listMsg").textContent = "Deleted.";
  load();
};

$("printBtn").onclick = function(){
  var parts = ["Printed " + fmtDate(new Date().toISOString())];
  if($("q").value.trim()) parts.push("Search: " + $("q").value.trim());
  if($("fCat").value) parts.push("Category: " + $("fCat").value);
  if($("fStore").value) parts.push("Store: " + $("fStore").value);
  $("printMeta").textContent = parts.join("   ·   ");
  window.print(); // choose "Save as PDF" as the destination
};

// ---------- Switching views ----------
function showList(on){
  $("listView").hidden = !on;
  $("entryView").hidden = on;
  $("viewBtn").textContent = on ? "Add New Price" : "View Materials Pricelist";
  if(on){ $("listMsg").textContent = ""; render() }
}
$("viewBtn").onclick = function(){
  var goList = $("listView").hidden;
  if(goList) cancelEdit();
  showList(goList);
};

load();
setInterval(load, 20000); // pick up other purchasers' changes every 20 seconds