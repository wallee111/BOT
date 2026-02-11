import{w as P,x as D,y as O,z as F,e as R,f as j,j as k,n as K}from"./storage-DEOcNPoM.js";import{s as U}from"./toast-CXqOG0Ji.js";const b=new Map;let M=!1;const I=1024;let m={selectedIdeaId:null,detailPane:null,detailContent:null,closeBtn:null,clonedBubble:null};const W='<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';function A(){return window.innerWidth>=I}function ee(){if(!M){if(M=!0,!document.getElementById("thread-notes-styles")){const t=document.createElement("style");t.id="thread-notes-styles",t.textContent=V(),document.head.appendChild(t)}m.detailPane=document.getElementById("detailPane"),m.detailContent=document.getElementById("detailContent"),m.closeBtn=document.querySelector(".detail-pane__close"),m.closeBtn?.addEventListener("click",L),window.addEventListener("resize",()=>{!A()&&m.selectedIdeaId&&L()})}}function X(t,e){if(!t||!e||t.dataset.threadAttached==="true")return;t.dataset.threadAttached="true";const n=document.createElement("div");n.className="thread-notes",n.dataset.threadContainer=e,n.innerHTML=`
        <div class="thread-notes-content" data-thread-content="${e}"></div>
        <div class="thread-input-row">
            <textarea 
                class="thread-input" 
                placeholder="Add a note..." 
                rows="1"
                data-thread-input="${e}"
            ></textarea>
            <button 
                type="button" 
                class="thread-send-btn" 
                data-thread-send="${e}"
                aria-label="Add note"
            >${W}</button>
        </div>
    `;const o=t.querySelector(".idea-body");o?o.after(n):t.appendChild(n),b.set(e,{isOpen:!1,notes:D(e),unsubscribe:null,container:n}),B(t,e),G(t,e)}function B(t,e){const n=O(e),o=t.querySelector(`.idea-thread[data-thread-id="${e}"]`);o&&(o.dataset.count=n.toString(),o.title=n>0?`${n} note${n!==1?"s":""}`:"Add notes")}function G(t,e){const n=b.get(e);if(!n)return;const{container:o}=n,r=o.querySelector(`[data-thread-input="${e}"]`),u=o.querySelector(`[data-thread-send="${e}"]`);r?.addEventListener("input",()=>{r.style.height="auto",r.style.height=Math.min(r.scrollHeight,120)+"px"}),r?.addEventListener("keydown",g=>{g.key==="Enter"&&!g.shiftKey&&(g.preventDefault(),$(t,e))}),u?.addEventListener("click",()=>{$(t,e)})}async function $(t,e){const n=b.get(e);if(!n)return;const{container:o}=n,r=o.querySelector(`[data-thread-input="${e}"]`),u=o.querySelector(`[data-thread-send="${e}"]`),g=r?.value?.trim();if(g){r&&(r.disabled=!0),u&&(u.disabled=!0);try{await F(e,g),r&&(r.value="",r.style.height="auto")}catch(v){console.error("[ThreadNotes] Failed to add note:",v),U("Failed to add note. Please try again.",{tone:"error"})}finally{r&&(r.disabled=!1),u&&(u.disabled=!1),r?.focus()}}}function E(t){const e=b.get(t);if(!e||e.isOpen)return;e.isOpen=!0,e.container.classList.add("is-open");const n=e.container.querySelector(`[data-thread-content="${t}"]`);n&&(n.innerHTML='<div class="thread-loading">Loading notes...</div>'),e.unsubscribe=P(t,r=>{e.notes=r,Q(t,r);const u=e.container.closest(".idea-bubble, .swipe-item, .idea-row");u&&B(u,t)},r=>{console.error("[ThreadNotes] Subscription error:",r),n&&(n.innerHTML='<div class="thread-error">Unable to load notes</div>')});const o=e.container.querySelector(`[data-thread-input="${t}"]`);setTimeout(()=>o?.focus(),100)}function z(t){const e=b.get(t);!e||!e.isOpen||(e.isOpen=!1,e.container.classList.remove("is-open"),e.unsubscribe&&(e.unsubscribe(),e.unsubscribe=null))}function J(t,e){const{detailPane:n,detailContent:o}=m;if(!n||!o||!e)return;m.selectedIdeaId&&m.selectedIdeaId!==t&&L();const r=e.classList.contains("idea-bubble")?e:e.querySelector(".idea-bubble")||e,u=r.cloneNode(!0);u.classList.remove("is-selected"),u.removeAttribute("data-thread-attached"),o.innerHTML="",o.appendChild(u),X(u,t),b.get(t)&&E(t),m.selectedIdeaId=t,m.clonedBubble=u,n.classList.add("has-content"),o.hidden=!1,r.classList.add("is-selected");const v=e.closest(".swipe-item");v&&v.classList.add("is-selected")}function L(){const{detailPane:t,detailContent:e,selectedIdeaId:n}=m;t&&(n&&z(n),document.querySelectorAll(".is-selected").forEach(o=>{o.classList.remove("is-selected")}),e&&(e.innerHTML="",e.hidden=!0),t.classList.remove("has-content"),m.selectedIdeaId=null,m.clonedBubble=null)}function te(t,e=null){const n=b.get(t);if(n){if(A()&&m.detailPane){e||(e=document.querySelector(`[data-thread-id="${t}"]`)?.closest(".idea-bubble, .swipe-item, .idea-row")),m.selectedIdeaId===t?L():J(t,e);return}n.isOpen?z(t):E(t)}}function Q(t,e){const n=b.get(t);if(!n)return;const o=n.container.querySelector(`[data-thread-content="${t}"]`);if(o){if(!e||e.length===0){o.innerHTML='<div class="thread-empty">No notes yet. Add one below.</div>';return}o.innerHTML=e.map(r=>`
        <div class="thread-note${r.pending?" is-pending":""}">
            <div class="thread-note-text">${R(r.text)}</div>
            <div class="thread-note-meta">${j(r.createdAt)}</div>
        </div>
    `).join(""),o.scrollTop=o.scrollHeight}}function V(){return`
        /* Inline Thread Notes (X.com style) */
        .thread-notes {
            margin-top: 0;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            overflow: hidden;
            max-height: 0;
            opacity: 0;
            transition: max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease, padding 0.3s ease;
            padding: 0;
        }

        .thread-notes.is-open {
            max-height: 400px;
            opacity: 1;
            margin-top: 0.75rem;
            padding-top: 0.75rem;
        }

        .thread-notes-content {
            max-height: 250px;
            overflow-y: auto;
        }

        .thread-note {
            padding: 0.5rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .thread-note:last-of-type {
            border-bottom: none;
        }

        .thread-note.is-pending {
            opacity: 0.6;
        }

        .thread-note-text {
            font-size: 0.875rem;
            line-height: 1.5;
            color: #e0e0e5;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .thread-note-meta {
            font-size: 0.7rem;
            color: #888;
            margin-top: 0.25rem;
        }

        .thread-input-row {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.75rem;
            align-items: flex-end;
        }

        .thread-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 1rem;
            padding: 0.6rem 1rem;
            color: inherit;
            font-family: inherit;
            font-size: 0.875rem;
            resize: none;
            min-height: 38px;
            max-height: 120px;
        }

        .thread-input:focus {
            outline: none;
            border-color: rgba(255, 202, 40, 0.5);
            background: rgba(255, 255, 255, 0.08);
        }

        .thread-input:disabled {
            opacity: 0.6;
            cursor: wait;
        }

        .thread-send-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #ffca28;
            color: #1a1a1a;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
            transition: transform 0.15s ease, opacity 0.15s ease;
        }

        .thread-send-btn:hover {
            transform: scale(1.05);
        }

        .thread-send-btn:active {
            transform: scale(0.95);
        }

        .thread-send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .thread-loading,
        .thread-empty,
        .thread-error {
            font-size: 0.85rem;
            color: #888;
            padding: 0.5rem 0;
            text-align: center;
        }

        .thread-error {
            color: #ff6b6b;
        }

        /* Note count badge on thread button */
        .idea-thread[data-count]:not([data-count="0"])::after {
            content: attr(data-count);
            position: absolute;
            top: -4px;
            right: -4px;
            font-size: 0.55rem;
            font-weight: 600;
            background: #ffca28;
            color: #1a1a1a;
            min-width: 14px;
            height: 14px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 3px;
        }

        .idea-thread {
            position: relative;
        }
    `}function ne(){b.forEach((t,e)=>{t.unsubscribe&&t.unsubscribe()}),b.clear()}function ae(t){let e=null,n=null,o="multi",r=null;function u(p){const c=t.getDropdown();!c||!p||(c.hidden=!1,c.style.visibility="hidden",c.style.top="0px",c.style.left="0px",requestAnimationFrame(()=>{const l=p.getBoundingClientRect(),f=c.getBoundingClientRect(),i=8,h=window.innerWidth,d=window.innerHeight;let s=l.bottom+i,a=l.left;s+f.height>d&&(s=Math.max(i,l.top-f.height-i)),a+f.width>h-i&&(a=Math.max(i,h-f.width-i)),c.style.top=`${Math.round(s)}px`,c.style.left=`${Math.round(a)}px`,c.style.visibility="visible"}))}function g(p,c={}){const l=t.getContent();if(!l)return;const f=c.mode||"multi",i=c.targetCategory||null,h=t.findIdea(p),d=h?t.getIdeaCategories(h):[],s=K(d);if(l.innerHTML="",l.onchange=null,o=f,r=i,f==="replace"){v(l,p,s,i);return}q(l,p,s)}function v(p,c,l,f){const i=document.createElement("button");i.type="button",i.className="category-modal__action-remove",i.textContent="Remove category",i.addEventListener("click",async()=>{try{const s=(f||"").trim().toLowerCase(),a=l.filter(w=>(w||"").trim().toLowerCase()!==s);await k(c,a),await t.onCategoriesChanged()}catch(s){console.error("Failed to remove category",s)}finally{_({skipSave:!0})}}),p.appendChild(i);const h=document.createElement("div"),d=t.getAvailableCategories().slice();d.sort((s,a)=>t.collator.compare(s,a)),d.forEach(s=>{if(s==="__uncategorized__")return;const a=document.createElement("div");a.className="category-modal__checkbox-item",(f||"").trim().toLowerCase()===s.toLowerCase()&&a.classList.add("is-active"),a.setAttribute("role","button"),a.tabIndex=0;const w=document.createElement("span");w.className="category-modal__checkbox-label",w.textContent=s,a.appendChild(w);const S=async()=>{if((f||"").trim().toLowerCase()===s.toLowerCase()){_({skipSave:!0});return}try{const y=l.findIndex(C=>(C||"").trim().toLowerCase()===(f||"").trim().toLowerCase());let x=l.slice();y>=0?x[y]=s:x=[s,...l.filter(C=>C.toLowerCase()!==s.toLowerCase())];const T=new Set;x=x.filter(C=>{const N=C.toLowerCase();return T.has(N)?!1:(T.add(N),!0)}),await k(c,x),await t.onCategoriesChanged()}catch(y){console.error("Failed to replace category",y)}finally{_({skipSave:!0})}};a.addEventListener("click",S),a.addEventListener("keydown",y=>{(y.key==="Enter"||y.key===" ")&&(y.preventDefault(),S())}),h.appendChild(a)}),p.appendChild(h)}function q(p,c,l){const f=[...t.getAvailableCategories()];f.includes("__uncategorized__")||f.unshift("__uncategorized__"),f.forEach(i=>{const h=i==="__uncategorized__",d=document.createElement("label");d.className="category-modal__checkbox-item";const s=document.createElement("input");s.type="checkbox",s.dataset.category=i,s.checked=h?l.length===0:l.includes(i);const a=document.createElement("span");a.className="category-modal__checkbox-label",a.textContent=h?"Uncategorized":i,d.appendChild(s),d.appendChild(a),p.appendChild(d)}),p.onchange=async i=>{const h=i.target;if(!(h instanceof HTMLInputElement)||h.type!=="checkbox")return;const d=Array.from(p.querySelectorAll('input[type="checkbox"]'));if(h.dataset.category==="__uncategorized__")h.checked&&d.forEach(a=>{a!==h&&(a.checked=!1)});else{const a=d.find(w=>w.dataset.category==="__uncategorized__");a&&(a.checked=!1)}const s=d.filter(a=>a.checked&&a.dataset.category&&a.dataset.category!=="__uncategorized__").map(a=>a.dataset.category);try{e&&(await k(e,s),await t.onCategoriesChanged(),n&&u(n))}catch(a){console.error("Category update failed",a)}}}function H(p,c,l={}){e=p,n=c||null,g(p,l),t.getDropdown().hidden=!1,u(c)}async function _(p={}){const c=t.getDropdown(),l=t.getContent();if(!c||c.hidden)return;if(!!!p.skipSave&&e&&l&&o==="multi"){const i=l.querySelectorAll('input[type="checkbox"]');if(i.length>0){const h=Array.from(i).filter(d=>d.checked).map(d=>d.dataset.category).filter(d=>d&&d!=="__uncategorized__");try{await k(e,h),await t.onCategoriesChanged()}catch(d){console.error("Saving categories failed:",d)}}}c.hidden=!0,l.innerHTML="",e=null,n=null}return{position:u,populate:g,open:H,close:_,getCurrentIdeaId(){return e},getAnchor(){return n},getMode(){return o},getTarget(){return r}}}export{ne as a,X as b,ae as c,ee as i,te as t};
