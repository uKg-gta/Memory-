    (function () {
      const STORAGE_KEY = 'memory_app_prototype_v6';

      const SUPABASE_URL = 'https://ncqypupxbywojcvwfgvg.supabase.co';
      const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_m2t_JJuJctloBi3VjRCKAg_WaiGdS8Z';
      const supabaseClient = window.supabase && window.supabase.createClient
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
        : null;
      const accountAuth = MemoryNoteAuth.create(supabaseClient, () => window.location.origin + window.location.pathname);
      const realtimeManager = MemoryRealtime.create(supabaseClient, {
        onChange: () => { cloudChangesAvailable = true; updateSyncButton(); },
        onStatus: (status, detail, error) => {
          if (status === 'disconnected') {
            console.warn('Memory realtime subscription issue:', detail, error || '');
            realtimeStatus = 'disconnected';
          } else {
            realtimeStatus = 'connected';
          }
          if (currentView === 'settings') renderMain();
        },
        onRemovalError: error => console.warn('Could not remove previous Memory realtime channel:', error)
      });
      const RESET_MARKER_CLIENT_ID = '__memory_account_reset__';
      let activeStorageKey='primary';
      let authUser=null,authReady=false,authTransitionGeneration=0,authTransitionPending=false,syncStatus='idle',syncError='',realtimeStatus='connecting',syncInProgress=false,syncStartedWritable=false,hasSuccessfulSync=false,syncReady=false,lastSavedState=null,suppressDeleteDetection=false,syncRequested=false,cloudChangesAvailable=false,activeSyncEditorDrafts=null,syncIdleResolvers=[];
      function cloudNotePayload(n,userId){return {user_id:userId,client_id:n.id,title:n.title||'',body_html:sanitizeNoteHtml(n.bodyHtml||''),checklist:n.checklist||[],links:(n.links||[]).map(({id,title,url,domain,titleLocked})=>({id,title,url,domain,titleLocked})),colour:n.colour||'paper',pinned:!!n.pinned,sort_order:Number(n.order||0),archived:!!n.archived,trashed:!!n.trashed,created_at:new Date(n.createdAt||Date.now()).toISOString(),deleted_at:null};}
      function noteSyncFingerprint(n){return MemorySyncCore.fingerprintNote(n,sanitizeNoteHtml);}
      async function subscribeToAccountChanges(userId){
        if(!userId||!supabaseClient)return;
        await realtimeManager.subscribe(userId);
      }
      async function fetchAllRows(table, columns, userId) {
        const all=[]; let from=0, pageSize=500;
        while(true){const q=await supabaseClient.from(table).select(columns).eq('user_id',userId).range(from,from+pageSize-1);if(q.error)throw q.error;const batch=q.data||[];all.push(...batch);if(batch.length<pageSize)break;from+=pageSize;}
        return all;
      }
      function waitForSyncIdle(){
        if(!syncInProgress)return Promise.resolve();
        return new Promise(resolve=>syncIdleResolvers.push(resolve));
      }
      function syncEditorDraftFingerprint(note) { return noteSyncFingerprint(note) + '|' + attachmentSyncFingerprint(note); }
      function captureOpenEditorDraft() {
        if (!editorDraft) return null;
        editorDraft.title = document.getElementById('editor-title').value;
        editorDraft.bodyHtml = captureEditorBodyHtml();
        return cloneData(editorDraft);
      }
      function registerEditorForActiveSync() {
        if (!syncInProgress || !activeSyncEditorDrafts || !editorDraft) return;
        const snapshot = captureOpenEditorDraft();
        const existing = activeSyncEditorDrafts.get(snapshot.id);
        if (existing) existing.open = true;
        else activeSyncEditorDrafts.set(snapshot.id, { baseline: cloneData(snapshot), current: cloneData(snapshot), dirtyAtStart: false, open: true });
      }
      function hydrateOpenEditorFromNote(note) {
        if (!note || !editorDraft || editorDraft.id !== note.id) return;
        const focusedId = document.activeElement && document.activeElement.id;
        editorDraft = cloneData(note);
        document.getElementById('editor-title').value = editorDraft.title || '';
        document.getElementById('editor-body').innerHTML = sanitizeNoteHtml(editorDraft.bodyHtml || '');
        document.getElementById('editor-dialog-title').textContent = editorDraft.title.trim() || 'Untitled note';
        applyEditorVisuals(); renderEditorChecklist(); renderEditorLinks(); renderEditorAttachments(); renderEditorMoreMenu();
        if (focusedId === 'editor-title') document.getElementById('editor-title').focus();
        else if (focusedId === 'editor-body') document.getElementById('editor-body').focus();
      }
      async function reconcileEditorDraftsAfterSync(drafts, conflictIds) {
        if (!drafts || !drafts.size) return;
        let changedState = false;
        for (const [noteId, record] of drafts) {
          const isOpen = !!(editorDraft && editorDraft.id === noteId && !document.getElementById('editor-overlay').classList.contains('hidden'));
          const current = isOpen ? captureOpenEditorDraft() : record.current;
          if (!current) continue;
          const changedDuringSync = syncEditorDraftFingerprint(current) !== syncEditorDraftFingerprint(record.baseline);
          if (changedDuringSync) {
            let preserved = cloneData(current);
            if (conflictIds.has(noteId)) {
              const conflictTitle = 'Conflict copy — ' + (record.baseline.title || 'Untitled note');
              const expected = { ...record.baseline, title: conflictTitle };
              let conflict = state.notes.find(note => note.id !== noteId && note.title === conflictTitle && syncEditorDraftFingerprint(note) === syncEditorDraftFingerprint(expected));
              if (!conflict) {
                conflict = { ...cloneData(record.baseline), id: uid('n-conflict'), title: conflictTitle, createdAt: Date.now(), updatedAt: new Date().toISOString() };
                state.notes.push(conflict);
              }
              preserved.id = conflict.id;
              preserved.title = 'Conflict copy — ' + (current.title || 'Untitled note');
              preserved.createdAt = conflict.createdAt;
              preserved.updatedAt = new Date().toISOString();
              const index = state.notes.findIndex(note => note.id === conflict.id);
              if (index >= 0) state.notes[index] = cloneData(preserved); else state.notes.push(cloneData(preserved));
              state.syncMeta = state.syncMeta || {};
              state.syncMeta.pendingNoteIds = Array.isArray(state.syncMeta.pendingNoteIds) ? state.syncMeta.pendingNoteIds : [];
              if (!state.syncMeta.pendingNoteIds.includes(preserved.id)) state.syncMeta.pendingNoteIds.push(preserved.id);
              if (isOpen) {
                editorDraft = cloneData(preserved); editingNoteId = preserved.id;
                document.getElementById('editor-title').value = preserved.title;
                document.getElementById('editor-body').innerHTML = sanitizeNoteHtml(preserved.bodyHtml || '');
                document.getElementById('editor-dialog-title').textContent = preserved.title;
                renderEditorChecklist(); renderEditorLinks(); renderEditorAttachments(); applyEditorVisuals(); renderEditorMoreMenu();
              }
              showToast('Your edits were preserved as a conflict copy. The cloud version remains available.');
            } else {
              preserved.updatedAt = new Date().toISOString();
              const index = state.notes.findIndex(note => note.id === noteId);
              if (index >= 0) state.notes[index] = cloneData(preserved); else state.notes.push(cloneData(preserved));
              state.syncMeta = state.syncMeta || {};
              state.syncMeta.pendingNoteIds = Array.isArray(state.syncMeta.pendingNoteIds) ? state.syncMeta.pendingNoteIds : [];
              if (!state.syncMeta.pendingNoteIds.includes(noteId)) state.syncMeta.pendingNoteIds.push(noteId);
            }
            changedState = true;
          } else if (syncStatus === 'synced' && isOpen && !record.dirtyAtStart) {
            const latest = state.notes.find(note => note.id === noteId);
            if (latest && syncEditorDraftFingerprint(latest) !== syncEditorDraftFingerprint(current)) hydrateOpenEditorFromNote(latest);
          }
        }
        if (changedState) { suppressDeleteDetection = true; await saveState(); suppressDeleteDetection = false; }
      }
      function updateSyncButton() {
        document.querySelectorAll('[data-sync-trigger]').forEach(button => {
          const label = button.querySelector('[data-sync-label]');
          const icon = button.querySelector('[data-sync-icon]');
          button.disabled = !authUser || !syncReady || !navigator.onLine || syncInProgress;
          button.setAttribute('aria-busy', String(syncInProgress));
          button.title = cloudChangesAvailable ? 'Cloud changes are available. Tap to sync.' : 'Sync notes with cloud';
          button.setAttribute('aria-label', syncInProgress ? 'Syncing notes' : 'Sync notes with cloud');
          if (label) label.textContent = syncInProgress ? 'Syncing…' : cloudChangesAvailable ? 'Sync •' : 'Sync';
          if (icon) icon.classList.toggle('animate-spin', syncInProgress);
        });
      }
      async function syncCloudNotes(){
        if(!authUser||!supabaseClient||!syncReady||!navigator.onLine||syncInProgress)return;
        const previousSyncStatus = syncStatus;
        const previousSyncError = syncError;
        syncStartedWritable = hasSuccessfulSync && syncStatus === 'synced';
        syncRequested = false;
        syncInProgress = true;
        syncStatus = 'syncing';
        syncError = '';
        cloudChangesAvailable = false;
        updateSyncButton();
        updateAuthGate();
        applyReadOnlyMode();
        if (currentView === 'settings') renderMain();

        const editorDrafts = new Map();
        activeSyncEditorDrafts = editorDrafts;
        if (!document.getElementById('editor-overlay').classList.contains('hidden') && editorDraft) {
          const beforePersist = captureOpenEditorDraft();
          const persisted = state.notes.find(note => note.id === beforePersist.id);
          const dirtyAtStart = persisted ? syncEditorDraftFingerprint(beforePersist) !== syncEditorDraftFingerprint(persisted) : true;
          if (!isDraftEmpty()) {
            const index = state.notes.findIndex(note => note.id === beforePersist.id);
            if (index >= 0) state.notes[index] = cloneData(beforePersist); else state.notes.push(cloneData(beforePersist));
            if (!await saveState()) {
              activeSyncEditorDrafts = null;
              syncInProgress = false;
              syncStartedWritable = false;
              syncStatus = previousSyncStatus;
              syncError = previousSyncError;
              updateSyncButton();
              applyReadOnlyMode();
              if (currentView === 'settings') renderMain();
              showToast('The open note could not be saved locally. Sync was not started.');
              return;
            }
          }
          editorDrafts.set(beforePersist.id, { baseline: cloneData(beforePersist), current: cloneData(beforePersist), dirtyAtStart: dirtyAtStart && isDraftEmpty(), open: true });
        }
        const syncConflictIds = new Set();
        try{
          const userId=authUser.id;
          // Read cloud records first. Nothing on the cloud is deleted merely because this device is empty.
          const [remoteFolders,remoteLabels,remoteNotes]=await Promise.all([
            fetchAllRows('folders','id,user_id,client_id,name,created_at,updated_at,deleted_at',userId),
            fetchAllRows('labels','id,user_id,client_id,name,colour,created_at,updated_at,deleted_at',userId),
            fetchAllRows('notes','id,user_id,client_id,title,body_html,checklist,links,colour,pinned,sort_order,folder_id,archived,trashed,created_at,updated_at,deleted_at',userId)
          ]);
          const resetMarker=remoteLabels.find(x=>x.client_id===RESET_MARKER_CLIENT_ID&&!x.deleted_at);
          if(resetMarker&&resetMarker.name==='RESET_PENDING') throw new Error('An account reset is in progress on another device. Please sync again shortly.');
          if(resetMarker&&Date.parse(resetMarker.updated_at||0)!==Date.parse((state.syncMeta&&state.syncMeta.accountResetAt)||0)){
            const retainedTheme=state.theme==='dark'?'dark':'light';
            state=normalizeState({...getDefaultData(),theme:retainedTheme,syncMeta:{accountResetAt:resetMarker.updated_at}});
            editingNoteId=null;editorDraft=null;clearTimeout(autoSaveTimer);
            document.getElementById('editor-overlay').classList.add('hidden');
            currentView='home';activeFolderId=null;activeLabelId=null;searchQuery='';
            selectionMode=false;selectedIds.clear();
            lastSavedState=cloneData(state);suppressDeleteDetection=true;await saveState();suppressDeleteDetection=false;
          }
          const folderMap=new Map(remoteFolders.filter(x=>x.client_id).map(x=>[x.client_id,x]));
          const labelMap=new Map(remoteLabels.filter(x=>x.client_id&&x.client_id!==RESET_MARKER_CLIENT_ID).map(x=>[x.client_id,x]));
          const uploadsNotes=[],noteExpectedVersions=new Map(),conflictedNoteIds=new Set();
          const syncMeta=state.syncMeta=state.syncMeta||{};
          const pendingFolderIds=new Set(syncMeta.pendingFolderIds||[]),pendingLabelIds=new Set(syncMeta.pendingLabelIds||[]),pendingNoteIds=new Set(syncMeta.pendingNoteIds||[]);
          const processedFolderIds=new Set(),processedLabelIds=new Set(),uploadedNoteIds=new Set();
          for(const f of state.folders){const r=folderMap.get(f.id),payload={user_id:userId,client_id:f.id,name:f.name,deleted_at:null};if(!r){const q=await supabaseClient.from('folders').insert(payload).select('id');if(q.error){if(q.error.code==='23505')syncRequested=true;else throw q.error;}processedFolderIds.add(f.id);}else if(pendingFolderIds.has(f.id)){const q=await supabaseClient.from('folders').update(payload).eq('user_id',userId).eq('client_id',f.id).eq('updated_at',r.updated_at).select('id');if(q.error)throw q.error;processedFolderIds.add(f.id);if(!q.data||!q.data.length)syncRequested=true;}}
          for(const l of state.labels){const r=labelMap.get(l.id),payload={user_id:userId,client_id:l.id,name:l.name,colour:l.colour||'olive',deleted_at:null};if(!r){const q=await supabaseClient.from('labels').insert(payload).select('id');if(q.error){if(q.error.code==='23505')syncRequested=true;else throw q.error;}processedLabelIds.add(l.id);}else if(pendingLabelIds.has(l.id)){const q=await supabaseClient.from('labels').update(payload).eq('user_id',userId).eq('client_id',l.id).eq('updated_at',r.updated_at).select('id');if(q.error)throw q.error;processedLabelIds.add(l.id);if(!q.data||!q.data.length)syncRequested=true;}}
const deletedFolders=(state.syncMeta&&state.syncMeta.deletedFolderIds)||[],deletedLabels=(state.syncMeta&&state.syncMeta.deletedLabelIds)||[];
          const tombTime=new Date().toISOString();
          if(deletedFolders.length){const q=await supabaseClient.from('folders').update({deleted_at:tombTime,updated_at:tombTime}).eq('user_id',userId).in('client_id',deletedFolders);if(q.error)throw q.error;}
          if(deletedLabels.length){const q=await supabaseClient.from('labels').update({deleted_at:tombTime,updated_at:tombTime}).eq('user_id',userId).in('client_id',deletedLabels);if(q.error)throw q.error;}
          const freshFolders=await fetchAllRows('folders','id,user_id,client_id,name,created_at,updated_at,deleted_at',userId);
          const freshLabels=(await fetchAllRows('labels','id,user_id,client_id,name,colour,created_at,updated_at,deleted_at',userId)).filter(x=>x.client_id!==RESET_MARKER_CLIENT_ID);
          for(const rf of freshFolders){const local=state.folders.find(x=>x.id===rf.client_id);if(rf.deleted_at&&local){state.folders=state.folders.filter(x=>x.id!==rf.client_id);state.notes.forEach(n=>{if(n.folderId===rf.client_id)n.folderId='';});}else if(!rf.deleted_at){if(local){local.name=rf.name;local.updatedAt=rf.updated_at;}else if(rf.client_id)state.folders.push({id:rf.client_id,name:rf.name,updatedAt:rf.updated_at});}}
          for(const rl of freshLabels){const local=state.labels.find(x=>x.id===rl.client_id);if(rl.deleted_at&&local){state.labels=state.labels.filter(x=>x.id!==rl.client_id);state.notes.forEach(n=>{n.labelIds=(n.labelIds||[]).filter(id=>id!==rl.client_id);});}else if(!rl.deleted_at){if(local){local.name=rl.name;local.colour=rl.colour||'olive';local.updatedAt=rl.updated_at;}else if(rl.client_id)state.labels.push({id:rl.client_id,name:rl.name,colour:rl.colour||'olive',updatedAt:rl.updated_at});}}
          syncMeta.pendingFolderIds=(syncMeta.pendingFolderIds||[]).filter(id=>!processedFolderIds.has(id));syncMeta.pendingLabelIds=(syncMeta.pendingLabelIds||[]).filter(id=>!processedLabelIds.has(id));
          const folderByClient=new Map(freshFolders.filter(x=>x.client_id&&!x.deleted_at).map(x=>[x.client_id,x]));
          const labelByClient=new Map(freshLabels.filter(x=>x.client_id&&!x.deleted_at).map(x=>[x.client_id,x]));
          const folderByUuid=new Map(freshFolders.filter(x=>!x.deleted_at).map(x=>[x.id,x]));
          const merged=[],deletedIds=syncMeta.deletedNoteIds||[];
          if(deletedIds.length){const oldRows=remoteNotes.filter(n=>deletedIds.includes(n.client_id));for(const oldNote of oldRows){const files=await supabaseClient.from('attachments').select('storage_path').eq('user_id',userId).eq('note_id',oldNote.id);if(files.error)throw files.error;if(files.data&&files.data.length){const rm=await supabaseClient.storage.from('memory-attachments').remove(files.data.map(x=>x.storage_path));if(rm.error)throw rm.error;const mark=await supabaseClient.from('attachments').update({deleted_at:new Date().toISOString()}).eq('user_id',userId).eq('note_id',oldNote.id);if(mark.error)throw mark.error;}}const q=await supabaseClient.from('notes').update({deleted_at:new Date().toISOString()}).eq('user_id',userId).in('client_id',deletedIds);if(q.error)throw q.error;}
          function remoteNoteToLocal(r,local){const f=r.folder_id?folderByUuid.get(r.folder_id):null;return {id:r.client_id,title:r.title||'',bodyHtml:sanitizeNoteHtml(r.body_html||''),checklist:r.checklist||[],links:r.links||[],colour:r.colour||'paper',pinned:!!r.pinned,order:Number(r.sort_order||0),folderId:f?f.client_id:'',labelIds:local&&local.labelIds||[],attachments:local&&local.attachments||[],archived:!!r.archived,trashed:!!r.trashed,createdAt:Date.parse(r.created_at)||local&&local.createdAt||Date.now(),updatedAt:r.updated_at};}
          function addConflictCopy(local){syncConflictIds.add(local.id);const copy={...cloneData(local),id:uid('n-conflict'),title:'Conflict copy — '+(local.title||'Untitled note'),createdAt:Date.now(),updatedAt:new Date().toISOString()};merged.push(copy);pendingNoteIds.add(copy.id);syncRequested=true;}
          function notePayload(n){const f=folderByClient.get(n.folderId);return {user_id:userId,client_id:n.id,title:n.title||'',body_html:sanitizeNoteHtml(n.bodyHtml||''),checklist:n.checklist||[],links:(n.links||[]).map(({id,title,url,domain,titleLocked})=>({id,title,url,domain,titleLocked})),colour:n.colour||'paper',pinned:!!n.pinned,sort_order:Number(n.order||0),folder_id:f?f.id:null,archived:!!n.archived,trashed:!!n.trashed,created_at:new Date(n.createdAt||Date.now()).toISOString(),deleted_at:null};}
          const noteSyncPlan=MemorySyncCore.planNoteSync(state.notes,remoteNotes,pendingNoteIds,{fingerprint:noteSyncFingerprint,remoteToLocal:remoteNoteToLocal});
          for(const item of noteSyncPlan.local){
            const n=item.local;
            if(item.action==='conflict-deleted'){addConflictCopy(n);pendingNoteIds.delete(n.id);}
            else if(item.action==='skip-deleted'){continue;}
            else if(item.action==='update-existing'){noteExpectedVersions.set(n.id,item.expectedUpdatedAt);uploadsNotes.push(notePayload(n));merged.push(n);}
            else if(item.action==='use-remote'){merged.push(item.remoteLocal);if(item.localChanged)addConflictCopy(n);}
            else if(item.action==='insert-local'){uploadsNotes.push(notePayload(n));merged.push(n);}
          }
          for(const remote of noteSyncPlan.remoteOnly)merged.push(remoteNoteToLocal(remote,null));
          // Compare-and-swap uses the server's last-seen version; device clocks never decide which edit wins.
          for(const payload of uploadsNotes){const expected=noteExpectedVersions.get(payload.client_id);if(expected){const q=await supabaseClient.from('notes').update(payload).eq('user_id',userId).eq('client_id',payload.client_id).eq('updated_at',expected).select('id,updated_at');if(q.error)throw q.error;if(!q.data||q.data.length===0){conflictedNoteIds.add(payload.client_id);syncRequested=true;}else uploadedNoteIds.add(payload.client_id);}else{const q=await supabaseClient.from('notes').insert(payload).select('id,updated_at');if(q.error){if(q.error.code==='23505'){conflictedNoteIds.add(payload.client_id);syncRequested=true;}else throw q.error;}else uploadedNoteIds.add(payload.client_id);}}
          if(conflictedNoteIds.size){const conflictRows=await fetchAllRows('notes','id,user_id,client_id,title,body_html,checklist,links,colour,pinned,sort_order,folder_id,archived,trashed,created_at,updated_at,deleted_at',userId);for(const clientId of conflictedNoteIds){const remote=conflictRows.find(x=>x.client_id===clientId&&!x.deleted_at),index=merged.findIndex(x=>x.id===clientId);if(!remote||index<0)continue;const localCopy=merged[index];merged[index]=remoteNoteToLocal(remote,localCopy);addConflictCopy(localCopy);pendingNoteIds.delete(clientId);}}
          const freshNotes=await fetchAllRows('notes','id,user_id,client_id,updated_at,deleted_at',userId);
          const noteByClient=new Map(freshNotes.filter(x=>x.client_id&&!x.deleted_at).map(x=>[x.client_id,x]));
          for(const n of merged){const row=noteByClient.get(n.id);if(row)n.updatedAt=row.updated_at;}
          syncMeta.pendingNoteIds=Array.from(pendingNoteIds).filter(id=>!uploadedNoteIds.has(id));
          // Persist label relationships using stable local IDs alongside the database UUID foreign keys.
          const relationRows=[];
          for(const n of merged){const nr=noteByClient.get(n.id);if(!nr)continue;for(const lid of (n.labelIds||[])){const lr=labelByClient.get(lid);if(lr)relationRows.push({user_id:userId,note_id:nr.id,label_id:lr.id,note_client_id:n.id,label_client_id:lid});}}
          const desiredRelations=new Set(relationRows.map(x=>x.note_client_id+'|'+x.label_client_id));
          const existingRelations=await supabaseClient.from('note_labels').select('note_id,label_id,note_client_id,label_client_id').eq('user_id',userId);
          if(existingRelations.error)throw existingRelations.error;
          for(const oldRel of (existingRelations.data||[])){const nkey=oldRel.note_client_id||freshNotes.find(n=>n.id===oldRel.note_id)?.client_id;const lkey=oldRel.label_client_id||freshLabels.find(l=>l.id===oldRel.label_id)?.client_id;if(nkey&&lkey&&!desiredRelations.has(nkey+'|'+lkey)){const del=await supabaseClient.from('note_labels').delete().eq('user_id',userId).eq('note_id',oldRel.note_id).eq('label_id',oldRel.label_id);if(del.error)throw del.error;}}
          if(relationRows.length){const q=await supabaseClient.from('note_labels').upsert(relationRows,{onConflict:'note_id,label_id'});if(q.error)throw q.error;}
          // Bring cloud label links onto notes without replacing local-only links until remote records are available.
          const rel=await supabaseClient.from('note_labels').select('note_id,label_id,note_client_id,label_client_id').eq('user_id',userId);
          if(rel.error)throw rel.error;
          const relByNote=new Map();for(const x of (rel.data||[])){const key=x.note_client_id||freshNotes.find(n=>n.id===x.note_id)?.client_id;const label=x.label_client_id||freshLabels.find(l=>l.id===x.label_id)?.client_id;if(key&&label){if(!relByNote.has(key))relByNote.set(key,[]);relByNote.get(key).push(label);}}
          for(const n of merged)n.labelIds=relByNote.get(n.id)||[];
          // Attachment metadata and binary files. Local Blobs remain in IndexedDB; remote files download when absent locally.
          const remoteAttachments=await fetchAllRows('attachments','id,user_id,note_id,client_id,storage_path,file_name,mime_type,size_bytes,created_at,deleted_at',userId);
          const deletedAttachments=(state.syncMeta&&state.syncMeta.deletedAttachmentIds)||[];
          for(const gone of deletedAttachments){const ra=remoteAttachments.find(a=>a.client_id===gone.attachmentId);if(ra&&!ra.deleted_at){const rm=await supabaseClient.storage.from('memory-attachments').remove([ra.storage_path]);if(rm.error)throw rm.error;const dm=await supabaseClient.from('attachments').update({deleted_at:new Date().toISOString()}).eq('user_id',userId).eq('client_id',gone.attachmentId);if(dm.error)throw dm.error;}}
          const attachmentMap=new Map(remoteAttachments.filter(a=>a.client_id).map(a=>[a.client_id,a]));
          const noteDbMap=new Map(freshNotes.filter(n=>n.client_id&&!n.deleted_at).map(n=>[n.client_id,n]));
          for(const n of merged){
            const nr=noteDbMap.get(n.id);if(!nr)continue;
            n.attachments=Array.isArray(n.attachments)?n.attachments:[];
            for(const att of n.attachments){
              const path=userId+'/'+n.id+'/'+att.id;
              const existing=attachmentMap.get(att.id);
              const blob=att.blob||att.fileBlob;
              if(blob instanceof Blob&&(!existing||existing.deleted_at)){
                const validation=MemoryAttachmentPolicy.validateFile(blob);if(!validation.valid)throw new Error('Attachment “'+(att.name||att.fileName||'file')+'” exceeds the '+MemoryAttachmentPolicy.MAX_FILE_LABEL+' per-file limit or has an invalid size.');
                const up=await supabaseClient.storage.from('memory-attachments').upload(path,blob,{upsert:true,contentType:att.mimeType||blob.type||'application/octet-stream'});
                if(up.error)throw up.error;
                const meta=await supabaseClient.from('attachments').upsert({user_id:userId,note_id:nr.id,client_id:att.id,storage_path:path,file_name:att.name||att.fileName||'Attachment',mime_type:att.mimeType||blob.type||'application/octet-stream',size_bytes:blob.size,deleted_at:null},{onConflict:'user_id,client_id'});if(meta.error)throw meta.error;
              }
            }
            for(const ra of remoteAttachments.filter(a=>a.note_id===nr.id&&!a.deleted_at)){
              const localAttachment=n.attachments.find(a=>a.id===ra.client_id);
              if(localAttachment && localAttachment.blob instanceof Blob)continue;
              const download=await supabaseClient.storage.from('memory-attachments').download(ra.storage_path);
              if(download.error)throw new Error('Could not download attachment “'+(ra.file_name||'file')+'”: '+download.error.message);
              const downloaded={id:ra.client_id||('a-'+ra.id),name:ra.file_name,type:(ra.file_name.split('.').pop()||'FILE').toUpperCase(),size:formatFileSize(ra.size_bytes),sizeBytes:Number(ra.size_bytes),mimeType:ra.mime_type,blob:download.data};
              if(localAttachment)Object.assign(localAttachment,downloaded);else n.attachments.push(downloaded);
            }
          }
          suppressDeleteDetection=true;state.notes=merged;
          // Folders and labels are merged independently so their IDs remain stable across devices.
          const remoteFolderByClient=new Map(freshFolders.filter(x=>x.client_id&&!x.deleted_at).map(x=>[x.client_id,x]));
          const localFolderIds=new Set(state.folders.map(x=>x.id));
          for(const r of freshFolders){if(r.client_id&&!r.deleted_at&&!localFolderIds.has(r.client_id))state.folders.push({id:r.client_id,name:r.name,updatedAt:r.updated_at});}
          const localLabelIds=new Set(state.labels.map(x=>x.id));
          for(const r of freshLabels){if(r.client_id&&!r.deleted_at&&!localLabelIds.has(r.client_id))state.labels.push({id:r.client_id,name:r.name,colour:r.colour||'olive',updatedAt:r.updated_at});}
          await saveState();suppressDeleteDetection=false;syncStatus='synced';hasSuccessfulSync=true;applyReadOnlyMode();updateSyncButton();
        }catch(e){suppressDeleteDetection=false;console.error('Memory sync failed:',e);syncStatus='error';syncError=e.message||'Cloud sync failed';applyReadOnlyMode();updateSyncButton();showToast('Sync failed. Your local notes are retained. Tap Sync to retry.');}
        finally{
          try { await reconcileEditorDraftsAfterSync(editorDrafts, syncConflictIds); }
          catch (draftError) { console.error('Could not reconcile the open editor after sync:', draftError); showToast('Your open note could not be reconciled automatically. Keep it open and try Sync again.'); }
          activeSyncEditorDrafts=null; syncInProgress=false; syncStartedWritable=false;
          applyReadOnlyMode(); updateSyncButton(); if(currentView==='settings')renderMain();
          const idleWaiters=syncIdleResolvers.splice(0); idleWaiters.forEach(resolve=>resolve());
          if(syncRequested){syncRequested=false;setTimeout(()=>syncCloudNotes(),100);}
        }
      }
      async function deleteDatabaseState(key) {
        await noteStorage.remove(key);
      }

      function updateAuthGate() {
        const gate = document.getElementById('auth-gate');
        const message = document.getElementById('auth-gate-message');
        const button = document.getElementById('auth-gate-google-btn');
        const locked = !authReady || !authUser;
        document.body.classList.toggle('auth-locked', locked);
        gate.classList.toggle('hidden', !locked);
        if (!authReady && authUser && syncInProgress) message.textContent = 'Syncing your notes…';
        else if (!authReady) message.textContent = 'Checking your account…';
        else if (syncStatus === 'error') message.textContent = 'Could not verify your account. Check your connection and try again.';
        else message.textContent = 'Sign in with Google to access and write your notes.';
        button.disabled = !supabaseClient || !authReady;
        button.textContent = supabaseClient ? 'Continue with Google' : 'Sign-in unavailable';
      }

      async function switchAccountWorkspace(user, isCurrent) {
        const stillCurrent = typeof isCurrent === 'function' ? isCurrent : () => true;
        if (!user || !stillCurrent()) return false;
        const targetKey = 'account:' + user.id;
        if (targetKey === activeStorageKey) return true;
        await persistenceQueue;
        if (!stillCurrent()) return false;
        const target = await readDatabaseState(targetKey);
        if (!stillCurrent()) return false;
        activeStorageKey = targetKey;
        state = normalizeState(target && Array.isArray(target.notes) ? target : getDefaultData());
        state.syncMeta = state.syncMeta || {};
        state.syncMeta.ownerUserId = user.id;
        lastSavedState = cloneData(state);
        const saved = await saveState();
        if (!saved) throw new Error('Could not persist the selected account workspace.');
        if (!stillCurrent()) return false;
        applyTheme();
        renderAll();
        return true;
      }
      async function initializeSupabaseAuth(){
        updateAuthGate();
        if (!supabaseClient) {
          authReady = true; syncStatus = 'unavailable'; updateAuthGate(); return;
        }
        try {
          const r = await accountAuth.getSession();
          if (r.error) throw r.error;
          authUser = r.data.session ? r.data.session.user : null;
          if (authUser) {
            await switchAccountWorkspace(authUser);
            syncReady = true; hasSuccessfulSync = false;
            await subscribeToAccountChanges(authUser.id);
            await syncCloudNotes();
          } else {
            syncReady = false; syncStatus = 'idle'; hasSuccessfulSync = false;
          }
          authReady = true;
          updateAuthGate();
          accountAuth.onAuthStateChange((_event, session) => {
            const nextUser = session ? session.user : null;
            const changed = (authUser && nextUser && authUser.id !== nextUser.id) || (!authUser && nextUser) || (authUser && !nextUser);
            const transition = changed ? ++authTransitionGeneration : authTransitionGeneration;
            authUser = nextUser;
            if (!nextUser) {
              authTransitionPending = false;
              authReady = true;
              syncReady = false; syncStatus = 'idle'; hasSuccessfulSync = false;
              syncRequested = false;
              realtimeStatus = 'disconnected';
              realtimeManager.close();
              updateAuthGate(); return;
            }
            if (changed) {
              authTransitionPending = true;
              authReady = false;
              syncReady = false; hasSuccessfulSync = false;
              syncRequested = false;
              realtimeStatus = 'connecting';
              realtimeManager.close();
              updateAuthGate();
              const isCurrentTransition = () => transition === authTransitionGeneration &&
                authUser && authUser.id === nextUser.id;
              waitForSyncIdle().then(async () => {
                if (!isCurrentTransition()) return;
                const switched = await switchAccountWorkspace(nextUser, isCurrentTransition);
                if (!switched || !isCurrentTransition()) return;
                syncReady = true;
                await subscribeToAccountChanges(nextUser.id);
                if (!isCurrentTransition()) return;
                await syncCloudNotes();
                if (!isCurrentTransition()) return;
                authTransitionPending = false;
                authReady = true;
                updateAuthGate();
                renderAll();
              }).catch(e => {
                if (!isCurrentTransition()) return;
                console.error('Could not switch local account workspace:', e);
                authTransitionPending = false;
                authReady = true;
                syncReady = false;
                syncStatus = 'error';
                syncError = 'Could not load this account’s local notes';
                updateAuthGate();
              });
            } else if (!authTransitionPending) {
              authReady = true;
              syncReady = true;
              updateAuthGate();
            }
            if (currentView === 'settings' && authReady) renderMain();
          });
        } catch (e) {
          console.error('Supabase auth initialization failed:', e);
          authReady = true; syncReady = false; syncStatus = 'error';
          syncError = e.message || 'Could not restore account session';
          updateAuthGate();
        }
      }
      async function handleGoogleAccountAction(){
        if(!supabaseClient){showToast('Account connection could not load. Check your internet connection and reload.');return;}
        if(authUser){const r=await accountAuth.signOut();if(r.error)showToast('Could not sign out: '+r.error.message);else showToast('Signed out. Local notes remain on this device.');return;}
        const r=await accountAuth.signInWithGoogle();if(r.error)showToast('Google sign-in failed: '+r.error.message);
      }


      const NOTE_COLOURS = [
        { id: 'paper', label: 'Warm paper', cls: 'note-bg-paper', swatchLight: '#FAF7F0', swatchDark: '#34372F' },
        { id: 'oatmeal', label: 'Oatmeal', cls: 'note-bg-oatmeal', swatchLight: '#E5DDCB', swatchDark: '#3E3D34' },
        { id: 'sand', label: 'Soft sand', cls: 'note-bg-sand', swatchLight: '#E6D5C3', swatchDark: '#463D33' },
        { id: 'olive', label: 'Muted olive', cls: 'note-bg-olive', swatchLight: '#DCE1D4', swatchDark: '#353E30' },
        { id: 'clay', label: 'Muted clay', cls: 'note-bg-clay', swatchLight: '#E8D2C6', swatchDark: '#47362F' }
      ];

      const LABEL_COLOURS = [
        { id: 'olive', label: 'Olive', swatch: '#879477', light: '#E6EBDD', dark: '#3D4937' },
        { id: 'navy', label: 'Navy', swatch: '#788BA0', light: '#E3E9EF', dark: '#3A4653' },
        { id: 'rust', label: 'Rust', swatch: '#B17A64', light: '#F0E3DC', dark: '#4B392F' },
        { id: 'pink', label: 'Pink', swatch: '#BD929A', light: '#F1E5E7', dark: '#4A3B3F' },
        { id: 'grey', label: 'Grey', swatch: '#92958F', light: '#E9EAE7', dark: '#41443F' }
      ];

      function getDefaultData() { return MemoryNoteState.getDefaultData(); }

      // IndexedDB is the primary local database. A one-time legacy localStorage
      // migration keeps data from the earlier prototype available.
      const noteStorage = MemoryNoteStorage.create(window.indexedDB);
      let persistenceQueue = Promise.resolve();
      let editorReturnFocus = null, editorReturnNoteId = null, drawerReturnFocus = null, confirmReturnFocus = null, previewReturnFocus = null;



      function cloneData(value) { return MemoryNoteState.cloneData(value); }

      function normalizeState(data) { return MemoryNoteState.normalizeState(data, sanitizeNoteHtml); }

      async function readDatabaseState(key = 'primary') {
        return noteStorage.read(key);
      }

      function attachmentSyncFingerprint(note) {
        return MemorySyncCore.fingerprintAttachments(note);
      }

      function saveState() {
        let snapshot;
        try { snapshot = cloneData(state); if(lastSavedState&&!suppressDeleteDetection){const prev=new Map((lastSavedState.notes||[]).map(n=>[n.id,n]));const now=new Date().toISOString();snapshot.syncMeta=snapshot.syncMeta||{};for(const k of ['deletedNoteIds','deletedFolderIds','deletedLabelIds','deletedAttachmentIds','pendingNoteIds','pendingFolderIds','pendingLabelIds'])snapshot.syncMeta[k]=Array.isArray(snapshot.syncMeta[k])?snapshot.syncMeta[k]:[];const present=new Set(snapshot.notes.map(n=>n.id));for(const oldNote of (lastSavedState.notes||[])){if(!present.has(oldNote.id)&&!snapshot.syncMeta.deletedNoteIds.includes(oldNote.id))snapshot.syncMeta.deletedNoteIds.push(oldNote.id);const current=snapshot.notes.find(n=>n.id===oldNote.id);const currentAtt=new Set((current&&current.attachments||[]).map(a=>a.id));for(const att of (oldNote.attachments||[]))if(!currentAtt.has(att.id)&&!snapshot.syncMeta.deletedAttachmentIds.some(x=>x.noteId===oldNote.id&&x.attachmentId===att.id))snapshot.syncMeta.deletedAttachmentIds.push({noteId:oldNote.id,attachmentId:att.id});}for(const kind of ['folders','labels']){const before=new Map((lastSavedState[kind]||[]).map(x=>[x.id,x]));const after=new Set((snapshot[kind]||[]).map(x=>x.id));const tombKey=kind==='folders'?'deletedFolderIds':'deletedLabelIds';for(const x of (lastSavedState[kind]||[]))if(!after.has(x.id)&&!snapshot.syncMeta[tombKey].includes(x.id))snapshot.syncMeta[tombKey].push(x.id);for(const x of (snapshot[kind]||[])){const oldItem=before.get(x.id);if(!oldItem||JSON.stringify(oldItem)!==JSON.stringify(x)){x.updatedAt=now;const pendingKey=kind==='folders'?'pendingFolderIds':'pendingLabelIds';if(!snapshot.syncMeta[pendingKey].includes(x.id))snapshot.syncMeta[pendingKey].push(x.id);}}}for(const n of snapshot.notes){const old=prev.get(n.id);if(!old||JSON.stringify({...old,attachments:undefined})!==JSON.stringify({...n,attachments:undefined})||attachmentSyncFingerprint(old)!==attachmentSyncFingerprint(n)){n.updatedAt=now;const live=state.notes.find(x=>x.id===n.id);if(live)live.updatedAt=n.updatedAt;if(!snapshot.syncMeta.pendingNoteIds.includes(n.id))snapshot.syncMeta.pendingNoteIds.push(n.id);}}state.syncMeta=snapshot.syncMeta;} }
        catch (error) {
          console.error('Could not prepare data for IndexedDB:', error);
          showToast('Could not prepare local data for saving');
          return Promise.resolve(false);
        }
        const storageKey = activeStorageKey;
        persistenceQueue = persistenceQueue.catch(() => {}).then(async () => {
          await noteStorage.write(storageKey, snapshot);
          lastSavedState=cloneData(snapshot);
          return true;
        }).catch(error => {
          console.error('IndexedDB save failed:', error);
          showToast('Local save failed. Check browser storage permissions.');
          return false;
        });
        return persistenceQueue;
      }

      async function initializeStorage() {
        try {
          const stored = await readDatabaseState();
          state = normalizeState(stored && Array.isArray(stored.notes) ? stored : getDefaultData());lastSavedState=cloneData(state);
          try { localStorage.removeItem('memory_app_prototype_v6'); } catch (_) {}
          if (!stored) await saveState();
        } catch (error) {
          console.error(error);
          state = normalizeState(getDefaultData());
          showToast('Local database unavailable. Memory is running in temporary mode.');
        }
      }

      let state = normalizeState(getDefaultData());
      let currentView = 'home'; // home | all | folders | labels | archive | trash | settings
      let activeFolderId = null;
      let activeLabelId = null;
      let searchQuery = '';

      // Multi-select state
      let selectionMode = false;
      let selectedIds = new Set();

      // Editor state
      let editingNoteId = null; // null when closed, 'NEW' or note.id when open
      let editorDraft = null;
      let formattingBarOpen = false;
      let autoSaveTimer = null;

      // Drag state
      let draggingNoteId = null;
      let allowDragFromHandle = false;

      // Toast timer
      let toastTimer = null;

      function uid(prefix) {
        return prefix + '-' + Math.random().toString(36).slice(2, 9);
      }

      function canEditCloudData() { return !!authUser && !!syncReady && navigator.onLine && (syncStatus === 'synced' || (syncInProgress && syncStartedWritable)); }

      function applyReadOnlyMode() {
        const readOnly = !canEditCloudData();
        document.body.classList.toggle('cloud-readonly', readOnly);
        const banner = document.getElementById('cloud-status-banner');
        if (banner) {
          banner.classList.toggle('hidden', !readOnly);
          banner.textContent = !navigator.onLine ? 'Offline · read-only. Showing the last notes saved on this device.' : syncStatus === 'error' ? 'Cloud sync needs attention · read-only until your notes sync successfully.' : syncInProgress ? 'Syncing cloud data · read-only until sync completes.' : 'Initial cloud sync required · tap Sync to enable editing.';
        }
        const overlay = document.getElementById('editor-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
          const title = document.getElementById('editor-title');
          const body = document.getElementById('editor-body');
          if (title) title.readOnly = readOnly;
          if (body) body.contentEditable = String(!readOnly);
          document.querySelectorAll('#editor-checklist-items input').forEach(el => { el.disabled = readOnly && el.type === 'checkbox'; el.readOnly = readOnly && el.type !== 'checkbox'; });
          document.querySelectorAll('#editor-panel button').forEach(btn => { btn.disabled = readOnly && !btn.matches('#editor-done-btn,[data-preview-att],[data-att-menu],[data-open-link],[data-sync-trigger]'); });
          const status = document.getElementById('editor-save-status');
          if (status && readOnly) status.textContent = !navigator.onLine ? 'Offline · read-only' : 'Read-only until cloud sync completes';
        }
        document.querySelectorAll('#main-content button').forEach(btn => { btn.disabled = readOnly && !btn.matches('[data-open-folder],[data-open-label]'); });
        document.querySelectorAll('#main-content input,#main-content select,#main-content textarea').forEach(el => { if (readOnly) el.disabled = true; });
        syncAttachmentMenuReadOnly(readOnly);
        updateSyncButton();
      }

      function showToast(msg) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
      }

      function applyTheme() {
        const isDark = state.theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        const icon = document.getElementById('theme-icon');
        if (icon) {
          icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
        }
        refreshIcons();
      }

      function refreshIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }

      function getColourClass(colourId) {
        const found = NOTE_COLOURS.find(c => c.id === colourId);
        return found ? found.cls : 'note-bg-paper';
      }

      function sanitizeNoteHtml(html) {
        return window.MemoryNoteSanitizer.sanitize(html);
      }

      function stripHtml(html) {
        return window.MemoryNoteSanitizer.stripHtml(html);
      }

      function captureEditorBodyHtml() {
        const bodyEl = document.getElementById('editor-body');
        const safeHtml = sanitizeNoteHtml(bodyEl.innerHTML);
        if (bodyEl.innerHTML !== safeHtml) bodyEl.innerHTML = safeHtml;
        return safeHtml;
      }

      function formatFileSize(bytes) {
        if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      function extractDomain(url) {
        try {
          const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
          return parsed.hostname.replace(/^www\./, '');
        } catch (e) {
          return url;
        }
      }

      function escapeHtml(str) {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // --- NAVIGATION ---
      function renderNav() {
        const counts = {
          home: state.notes.filter(n => !n.archived && !n.trashed).length,
          archive: state.notes.filter(n => n.archived && !n.trashed).length,
          trash: state.notes.filter(n => n.trashed).length
        };

        const items = [
          { id: 'home', label: 'Home', icon: 'home', count: counts.home },
          { id: 'all', label: 'All notes', icon: 'layers', count: counts.home },
          { id: 'folders', label: 'Folders', icon: 'folder', count: state.folders.length },
          { id: 'labels', label: 'Labels', icon: 'tag', count: state.labels.length },
          { id: 'archive', label: 'Archive', icon: 'archive', count: counts.archive },
          { id: 'trash', label: 'Trash', icon: 'trash-2', count: counts.trash },
          { id: 'settings', label: 'Settings', icon: 'settings', count: null }
        ];

        const html = items.map(item => {
          const isActive = currentView === item.id;
          return `
            <button type="button" data-nav="${item.id}" aria-current="${isActive ? 'page' : 'false'}" class="nav-item ${isActive ? 'active' : ''} w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-main hover:bg-surface/70 transition-colors">
              <span class="flex items-center gap-3">
                <i data-lucide="${item.icon}" class="w-4 h-4 text-muted"></i>
                <span>${item.label}</span>
              </span>
              ${item.count !== null ? `<span class="text-xs text-muted">${item.count}</span>` : ''}
            </button>
          `;
        }).join('');

        document.getElementById('desktop-nav').innerHTML = html;
        document.getElementById('mobile-nav').innerHTML = html;

        document.querySelectorAll('[data-nav]').forEach(btn => {
          btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-nav');
            exitSelectionMode();
            currentView = target;
            if (target !== 'folders') activeFolderId = null;
            if (target !== 'labels') activeLabelId = null;
            closeMobileDrawer();
            renderAll();
          });
        });
      }

      function openMobileDrawer() {
        const drawer = document.getElementById('mobile-drawer');
        drawerReturnFocus = document.activeElement;
        drawer.classList.remove('-translate-x-full');
        drawer.setAttribute('aria-hidden', 'false');
        document.getElementById('open-drawer-btn').setAttribute('aria-expanded', 'true');
        document.getElementById('mobile-drawer-backdrop').classList.remove('hidden');
        (drawer.querySelector('button, a, input, [tabindex="0"]') || drawer).focus();
      }
      function closeMobileDrawer() {
        const drawer = document.getElementById('mobile-drawer');
        drawer.classList.add('-translate-x-full');
        drawer.setAttribute('aria-hidden', 'true');
        document.getElementById('open-drawer-btn').setAttribute('aria-expanded', 'false');
        document.getElementById('mobile-drawer-backdrop').classList.add('hidden');
        if (drawerReturnFocus && drawerReturnFocus.focus) drawerReturnFocus.focus();
        drawerReturnFocus = null;
      }

      // --- FILTERING & ORDERING ---
      function getSearchFields(note) {
        const folderName = (state.folders.find(f => f.id === note.folderId) || {}).name || '';
        const labelNames = (note.labelIds || []).map(lid => (state.labels.find(l => l.id === lid) || {}).name || '').join(' ');
        return [
          note.title || 'Untitled note',
          stripHtml(note.bodyHtml),
          (note.checklist || []).map(c => c.text).join(' '),
          (note.attachments || []).map(a => a.name + ' ' + a.type).join(' '),
          (note.links || []).map(l => l.title + ' ' + l.domain + ' ' + l.url).join(' '),
          folderName,
          labelNames
        ].map(value => String(value || '').toLowerCase());
      }

      function searchScore(note, q) {
        if (!q) return 0;
        const needle = q.toLowerCase().trim();
        const fields = getSearchFields(note);
        let best = 0;
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactWord = new RegExp('(?:^|[^\\p{L}\\p{N}_])' + escaped + '(?:$|[^\\p{L}\\p{N}_])', 'u');
        fields.forEach((field, index) => {
          const weight = index === 0 ? 80 : index === 1 ? 55 : index === 2 ? 45 : 30;
          if (field === needle) best = Math.max(best, 1200 + weight);
          else if (field.includes(needle) && exactWord.test(field)) best = Math.max(best, 900 + weight);
          else if (field.includes(needle)) best = Math.max(best, 500 + weight);
          const parts = needle.split(/\s+/).filter(Boolean);
          if (parts.length > 1 && parts.every(part => field.includes(part))) best = Math.max(best, 300 + weight);
        });
        return best;
      }

      function matchesSearch(note, q) {
        return !q || searchScore(note, q) > 0;
      }

      function getVisibleNotes() {
        const q = searchQuery.trim();
        let list = [];

        if (currentView === 'archive') {
          list = state.notes.filter(n => n.archived && !n.trashed);
        } else if (currentView === 'trash') {
          list = state.notes.filter(n => n.trashed);
        } else if (currentView === 'folders' && activeFolderId) {
          list = state.notes.filter(n => !n.archived && !n.trashed && (activeFolderId === '__unfiled__' ? !n.folderId : n.folderId === activeFolderId));
        } else if (currentView === 'labels' && activeLabelId) {
          list = state.notes.filter(n => !n.archived && !n.trashed && (n.labelIds || []).includes(activeLabelId));
        } else {
          list = state.notes.filter(n => !n.archived && !n.trashed);
        }

        if (q) {
          if (currentView !== 'archive' && currentView !== 'trash') list = list.filter(n => !n.archived && !n.trashed && matchesSearch(n, q));
          else list = list.filter(n => matchesSearch(n, q));
        }

        // Relevance first. Equal scores fall back to normal pinned/manual ordering.
        return list.sort((a, b) => {
          if (q) {
            const delta = searchScore(b, q) - searchScore(a, q);
            if (delta) return delta;
          }
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (a.order || 0) - (b.order || 0);
        });
      }

      // --- MAIN RENDERING ---
      function renderMain() {
        const container = document.getElementById('main-content');

        if (currentView === 'settings') {
          renderSettingsView(container);
          return;
        }

        if (currentView === 'folders' && !activeFolderId && !searchQuery.trim()) {
          renderFoldersDirectory(container);
          return;
        }

        if (currentView === 'labels' && !activeLabelId && !searchQuery.trim()) {
          renderLabelsDirectory(container);
          return;
        }

        const notes = getVisibleNotes();
        let headerHtml = '';

        if (currentView === 'home') {
          // Fixed greeting: "Welcome back" (no time of day, no user name) + Compact "Take a note…"
          headerHtml = `
            <div class="mb-6 space-y-4">
              <h1 class="text-2xl font-semibold tracking-tight text-main">Welcome back</h1>
              <button id="quick-capture-btn" type="button" class="w-full max-w-xl h-11 px-4 rounded-2xl bg-elevated border border-muted hover:border-strong text-left text-sm text-muted flex items-center justify-between transition-colors" style="box-shadow: var(--shadow-card);">
                <span>Take a note…</span>
                <i data-lucide="plus" class="w-4 h-4 text-muted"></i>
              </button>
            </div>
          `;
        } else if (currentView === 'all') {
          headerHtml = `
            <div class="mb-6 flex items-center justify-between gap-3">
              <div>
                <h1 class="text-xl font-semibold tracking-tight">All notes</h1>
                <p class="text-xs text-muted mt-0.5">${notes.length} active ${notes.length === 1 ? 'note' : 'notes'}</p>
              </div>
              <button id="quick-capture-btn" type="button" class="px-3.5 py-2 rounded-xl btn-olive text-xs font-medium inline-flex items-center gap-1.5">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> New note
              </button>
            </div>
          `;
        } else if (currentView === 'folders' && activeFolderId) {
          const folder = activeFolderId === '__unfiled__' ? { name: 'Unfiled' } : state.folders.find(f => f.id === activeFolderId);
          headerHtml = `
            <div class="mb-6 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <button id="back-to-folders-btn" type="button" class="p-1.5 rounded-lg hover:bg-surface text-muted" aria-label="Back to folders">
                  <i data-lucide="arrow-left" class="w-4 h-4"></i>
                </button>
                <div>
                  <h1 class="text-xl font-semibold tracking-tight">${escapeHtml(folder ? folder.name : 'Folder')}</h1>
                  <p class="text-xs text-muted">${notes.length} ${notes.length === 1 ? 'note' : 'notes'}</p>
                </div>
              </div>
              <button id="quick-capture-btn" type="button" class="px-3.5 py-2 rounded-xl btn-olive text-xs font-medium inline-flex items-center gap-1.5">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> New note
              </button>
            </div>
          `;
        } else if (currentView === 'labels' && activeLabelId) {
          const label = state.labels.find(l => l.id === activeLabelId);
          headerHtml = `
            <div class="mb-6 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <button id="back-to-labels-btn" type="button" class="p-1.5 rounded-lg hover:bg-surface text-muted" aria-label="Back to labels">
                  <i data-lucide="arrow-left" class="w-4 h-4"></i>
                </button>
                <div>
                  <h1 class="text-xl font-semibold tracking-tight"># ${escapeHtml(label ? label.name : 'Label')}</h1>
                  <p class="text-xs text-muted">${notes.length} ${notes.length === 1 ? 'note' : 'notes'}</p>
                </div>
              </div>
              <button id="quick-capture-btn" type="button" class="px-3.5 py-2 rounded-xl btn-olive text-xs font-medium inline-flex items-center gap-1.5">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> New note
              </button>
            </div>
          `;
        } else if (currentView === 'archive') {
          headerHtml = `
            <div class="mb-6">
              <h1 class="text-xl font-semibold tracking-tight">Archive</h1>
              <p class="text-xs text-muted mt-0.5">Archived notes are hidden from Home and normal Search. Long-press or open a note to restore it.</p>
            </div>
          `;
        } else if (currentView === 'trash') {
          headerHtml = `
            <div class="mb-6 flex items-center justify-between gap-3">
              <div>
                <h1 class="text-xl font-semibold tracking-tight">Trash</h1>
                <p class="text-xs text-muted mt-0.5">Deleted notes stay here until you restore or permanently delete them.</p>
              </div>
              ${notes.length > 0 ? `<button id="empty-trash-btn" type="button" class="px-3 py-1.5 rounded-xl border border-muted text-xs font-medium hover:bg-surface" style="color: var(--accent-clay);">Empty Trash</button>` : ''}
            </div>
          `;
        }

        const searchBanner = searchQuery.trim()
          ? `<div class="mb-4 text-xs text-muted">Showing ${notes.length} result${notes.length === 1 ? '' : 's'} for "<span class="text-main font-medium">${escapeHtml(searchQuery.trim())}</span>"${currentView !== 'archive' && currentView !== 'trash' ? ' (active notes only)' : ''}</div>`
          : '';

        const hintBar = notes.length > 0 && !selectionMode && currentView !== 'trash'
          ? `<div class="mb-3 flex items-center justify-between text-[11px] text-muted">
               <span>Tap to open · Long-press to select · Hold the handle to reorder</span>
             </div>`
          : '';

        let boardHtml = '';
        if (notes.length === 0) {
          const emptyMsg = searchQuery.trim()
            ? 'No matching notes found.'
            : currentView === 'archive'
              ? 'No archived notes yet.'
              : currentView === 'trash'
                ? 'Trash is empty.'
                : 'No notes here yet. Tap "Take a note…" to capture something.';
          boardHtml = `
            <div class="py-16 text-center rounded-2xl border border-dashed border-muted text-sm text-muted">
              ${emptyMsg}
            </div>
          `;
        } else {
          // Uniform-height rounded cards, 2 cols mobile, 3 tablet, 4 desktop. Title ONLY (privacy rule).
          boardHtml = `
            <div id="notes-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              ${notes.map(note => renderNoteCard(note)).join('')}
            </div>
          `;
        }

        container.innerHTML = headerHtml + searchBanner + hintBar + boardHtml;
        bindMainEvents();
      }

      function renderNoteCard(note) {
        const hasTitle = Boolean(note.title && note.title.trim());
        const displayTitle = hasTitle ? escapeHtml(note.title.trim()) : 'Untitled note';
        const isSelected = selectedIds.has(note.id);
        const canDrag = currentView === 'home' || currentView === 'all';

        return `
          <article
            data-note-id="${note.id}"
            role="group"
            tabindex="0"
            aria-label="Note: ${escapeHtml(displayTitle)}. Press Enter to open."
            draggable="${canDrag ? 'true' : 'false'}"
            class="note-card ${getColourClass(note.colour)} ${isSelected ? 'is-selected' : ''} relative p-3.5 flex flex-col justify-between cursor-pointer"
          >
            <div class="flex items-start justify-between gap-2">
              <h2 class="text-sm font-medium leading-snug line-clamp-2 ${hasTitle ? 'text-main' : 'text-muted italic font-normal'}">
                ${displayTitle}
              </h2>
              ${selectionMode ? `
                <span class="shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-transparent text-white' : 'border-strong bg-transparent'}" style="${isSelected ? 'background-color: var(--accent-olive);' : ''}">
                  ${isSelected ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
                </span>
              ` : (canDrag ? `
                <button type="button" class="drag-handle shrink-0 -mr-1 -mt-1 p-1 rounded-md text-muted/60 hover:text-main hover:bg-black/5 dark:hover:bg-white/10" aria-label="Drag to reorder" title="Drag to reorder">
                  <i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>
                </button>
              ` : '')}
            </div>

            <div class="flex items-center justify-between text-[11px] text-muted">
              <span>${note.pinned ? 'Pinned' : 'Note'}</span>
              ${note.pinned ? '<i data-lucide="pin" class="w-3 h-3 text-muted"></i>' : ''}
            </div>
          </article>
        `;
      }

      function renderFoldersDirectory(container) {
        const unfiledCount = state.notes.filter(n => !n.archived && !n.trashed && !n.folderId).length;
        const folderCards = state.folders.map(f => {
          const count = state.notes.filter(n => !n.archived && !n.trashed && n.folderId === f.id).length;
          return `
            <div class="relative p-4 rounded-2xl bg-elevated border border-muted flex items-center justify-between gap-3" style="box-shadow: var(--shadow-card);">
              <button type="button" data-open-folder="${f.id}" class="min-w-0 flex-1 text-left flex items-center gap-3">
                <i data-lucide="folder" class="w-5 h-5 text-muted shrink-0"></i>
                <span class="font-medium text-sm truncate">${escapeHtml(f.name)}</span>
                <span class="text-xs text-muted shrink-0">${count}</span>
              </button>
              <div class="relative shrink-0">
                <button type="button" data-folder-menu="${f.id}" class="p-2 rounded-lg hover:bg-surface text-muted" title="Folder options" aria-label="Options for folder ${escapeHtml(f.name)}" aria-expanded="false"><i data-lucide="more-vertical" class="w-4 h-4"></i></button>
                <div data-folder-menu-panel="${f.id}" class="hidden absolute right-0 top-full mt-1 z-20 w-40 rounded-xl bg-elevated border border-muted p-1.5 shadow-lg">
                  <button type="button" data-edit-folder="${f.id}" class="w-full px-2.5 py-2 rounded-lg hover:bg-surface text-left text-xs">Edit folder name</button>
                  <button type="button" data-delete-folder="${f.id}" class="w-full px-2.5 py-2 rounded-lg hover:bg-surface text-left text-xs text-muted">Delete folder</button>
                </div>
              </div>
            </div>
          `;
        }).join('');
        container.innerHTML = `
          <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div><h1 class="text-xl font-semibold tracking-tight">Folders</h1><p class="text-xs text-muted mt-0.5">One folder per note. Folders stay at one level.</p></div>
            <form id="new-folder-form" class="flex items-center gap-2">
              <input id="new-folder-input" type="text" placeholder="New folder name" class="h-9 px-3 rounded-xl bg-elevated border border-muted text-xs text-main placeholder:text-muted focus:outline-none focus:border-strong" />
              <button type="submit" class="h-9 px-3 rounded-xl btn-olive text-xs font-medium">Create</button>
            </form>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <button type="button" data-open-folder="__unfiled__" class="p-4 rounded-2xl bg-elevated border border-muted hover:border-strong text-left flex items-center justify-between" style="box-shadow: var(--shadow-card);">
              <span class="flex items-center gap-3 min-w-0"><i data-lucide="folder-open" class="w-5 h-5 text-muted shrink-0"></i><span class="font-medium text-sm">Unfiled</span></span><span class="text-xs text-muted">${unfiledCount}</span>
            </button>
            ${folderCards || '<div class="text-sm text-muted">No folders yet.</div>'}
          </div>
        `;

        container.querySelectorAll('[data-open-folder]').forEach(btn => btn.addEventListener('click', () => {
          activeFolderId = btn.getAttribute('data-open-folder');
          renderAll();
        }));
        container.querySelectorAll('[data-folder-menu]').forEach(btn => btn.addEventListener('click', e => {
          e.stopPropagation();
          const folderId = btn.getAttribute('data-folder-menu');
          const panel = container.querySelector(`[data-folder-menu-panel="${folderId}"]`);
          const willOpen = panel && panel.classList.contains('hidden');
          container.querySelectorAll('[data-folder-menu-panel]').forEach(menu => menu.classList.add('hidden'));
          container.querySelectorAll('[data-folder-menu]').forEach(menuBtn => menuBtn.setAttribute('aria-expanded', 'false'));
          if (panel && willOpen) {
            panel.classList.remove('hidden');
            btn.setAttribute('aria-expanded', 'true');
          }
        }));
        container.querySelectorAll('[data-edit-folder]').forEach(btn => btn.addEventListener('click', e => {
          e.stopPropagation();
          const folderId = btn.getAttribute('data-edit-folder');
          const folder = state.folders.find(f => f.id === folderId);
          if (!folder) return;
          const nextName = window.prompt('Rename folder', folder.name);
          if (nextName === null) return;
          const cleaned = nextName.trim();
          if (!cleaned) { showToast('Folder name cannot be empty'); return; }
          if (state.folders.some(f => f.id !== folderId && f.name.toLowerCase() === cleaned.toLowerCase())) {
            showToast('A folder with that name already exists');
            return;
          }
          if (cleaned === folder.name) return;
          folder.name = cleaned;
          saveState(); renderAll(); showToast('Folder renamed');
        }));

        container.querySelectorAll('[data-delete-folder]').forEach(btn => btn.addEventListener('click', e => {
          e.stopPropagation();
          const folderId = btn.getAttribute('data-delete-folder');
          const folder = state.folders.find(f => f.id === folderId);
          const count = state.notes.filter(n => n.folderId === folderId).length;
          if (!folder) return;
          openConfirm({
            title: 'Delete folder?',
            message: `Delete “${folder.name}”? ${count} ${count === 1 ? 'note will' : 'notes will'} move to Trash. You can restore those notes later; restored notes will be Unfiled.`,
            destructive: true,
            onConfirm: () => {
              state.notes.forEach(note => {
                if (note.folderId === folderId) { note.folderId = ''; note.trashed = true; note.archived = false; }
              });
              state.folders = state.folders.filter(f => f.id !== folderId);
              if (activeFolderId === folderId) activeFolderId = null;
              saveState(); renderAll(); showToast(`Folder deleted; ${count} ${count === 1 ? 'note moved' : 'notes moved'} to Trash`);
            }
          });
        }));

        const form = document.getElementById('new-folder-form');
        form.addEventListener('submit', e => {
          e.preventDefault();
          const input = document.getElementById('new-folder-input');
          const name = input.value.trim();
          if (!name) return;
          if (state.folders.some(f => f.name.toLowerCase() === name.toLowerCase())) { showToast('A folder with that name already exists'); return; }
          state.folders.push({ id: uid('f'), name });
          saveState(); renderAll(); showToast(`Folder “${name}” created`);
        });
      }

      function labelColour(label) { return LABEL_COLOURS.find(c => c.id === (label && label.colour)) || LABEL_COLOURS[0]; }
      function labelTintStyle(label) {
        const c = labelColour(label);
        return `background-color:${state.theme === 'dark' ? c.dark : c.light}; border-color:${c.swatch}55;`;
      }
      function renderLabelColourControls(label) {
        return LABEL_COLOURS.map(c => `<button type="button" data-set-label-colour="${label.id}" data-colour-value="${c.id}" class="label-swatch" style="background:${c.swatch};" title="${c.label}" aria-label="Set ${escapeHtml(label.name)} colour to ${c.label}"></button>`).join('');
      }

      function renderLabelsDirectory(container) {
        const cards = state.labels.map(label => {
          const count = state.notes.filter(n => !n.archived && !n.trashed && (n.labelIds || []).includes(label.id)).length;
          const colour = labelColour(label);
          return `
            <div class="label-card p-4 flex flex-col gap-3" style="${labelTintStyle(label)}">
              <button type="button" data-open-label="${label.id}" class="text-left flex items-center justify-between gap-3">
                <span class="min-w-0 flex items-center gap-2.5"><i data-lucide="tag" class="w-4 h-4 shrink-0" style="color:${colour.swatch}"></i><span class="font-medium text-sm truncate">${escapeHtml(label.name)}</span></span>
                <span class="text-xs text-muted shrink-0">${count}</span>
              </button>
              <div class="flex items-center justify-between gap-2 label-card-actions">
                <div class="flex items-center gap-2">${renderLabelColourControls(label)}</div>
                <button type="button" data-delete-label="${label.id}" class="rounded-lg text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 p-1.5" title="Delete label" aria-label="Delete label ${escapeHtml(label.name)}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
              </div>
            </div>
          `;
        }).join('');

        container.innerHTML = `
          <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div><h1 class="text-xl font-semibold tracking-tight">Labels</h1><p class="text-xs text-muted mt-0.5">Tag notes across folders. New labels start in muted olive.</p></div>
            <form id="new-label-form" class="flex items-center gap-2">
              <input id="new-label-input" type="text" placeholder="New label name" class="h-9 px-3 rounded-xl bg-elevated border border-muted text-xs text-main placeholder:text-muted focus:outline-none focus:border-strong" />
              <button type="submit" class="h-9 px-3 rounded-xl btn-olive text-xs font-medium">Create</button>
            </form>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards || '<div class="text-sm text-muted">No labels yet.</div>'}</div>
        `;

        container.querySelectorAll('[data-open-label]').forEach(btn => btn.addEventListener('click', () => { activeLabelId = btn.getAttribute('data-open-label'); renderAll(); }));
        container.querySelectorAll('[data-set-label-colour]').forEach(btn => btn.addEventListener('click', e => {
          e.stopPropagation();
          const label = state.labels.find(l => l.id === btn.getAttribute('data-set-label-colour'));
          if (!label) return;
          label.colour = btn.getAttribute('data-colour-value');
          saveState(); renderAll(); showToast(`${label.name} colour updated everywhere`);
        }));
        container.querySelectorAll('[data-delete-label]').forEach(btn => btn.addEventListener('click', e => {
          e.stopPropagation();
          const labelId = btn.getAttribute('data-delete-label');
          const label = state.labels.find(l => l.id === labelId);
          if (!label) return;
          const count = state.notes.filter(n => (n.labelIds || []).includes(labelId)).length;
          openConfirm({
            title: 'Delete label?',
            message: `Delete “${label.name}”? It will be removed from ${count} ${count === 1 ? 'note' : 'notes'}. The notes themselves will remain unchanged.`,
            destructive: true,
            onConfirm: () => {
              state.labels = state.labels.filter(l => l.id !== labelId);
              state.notes.forEach(n => { n.labelIds = (n.labelIds || []).filter(id => id !== labelId); });
              if (activeLabelId === labelId) activeLabelId = null;
              saveState(); renderAll(); showToast('Label deleted');
            }
          });
        }));

        document.getElementById('new-label-form').addEventListener('submit', e => {
          e.preventDefault();
          const input = document.getElementById('new-label-input');
          const name = input.value.trim();
          if (!name) return;
          if (state.labels.some(l => l.name.toLowerCase() === name.toLowerCase())) { showToast('A label with that name already exists'); return; }
          state.labels.push({ id: uid('l'), name, colour: 'olive' });
          saveState(); renderAll(); showToast(`Label “${name}” created`);
        });
      }

      let resetInProgress = false;

      async function listAccountStoragePaths(userId) {
        const paths = [];
        async function walk(prefix) {
          let offset = 0;
          while (true) {
            const result = await supabaseClient.storage.from('memory-attachments').list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
            if (result.error) throw result.error;
            const items = result.data || [];
            for (const item of items) {
              if (item.id === null) await walk(prefix + '/' + item.name);
              else paths.push(prefix + '/' + item.name);
            }
            if (items.length < 1000) break;
            offset += items.length;
          }
        }
        await walk(userId);
        return paths;
      }

      async function resetCurrentAccountData() {
        if (resetInProgress || !authUser || !supabaseClient) return;
        const userId = authUser.id;
        const email = authUser.email || 'this Google account';
        const typed = window.prompt('This permanently erases all Memory notes, folders, labels, and attachments for ' + email + '. Your Google account will stay signed in.\n\nType RESET to continue:');
        if (typed !== 'RESET') {
          if (typed !== null) showToast('Reset cancelled. Type RESET exactly to confirm.');
          return;
        }
        if (!navigator.onLine) { showToast('Connect to the internet before resetting this account.'); return; }

        resetInProgress = true;
        const wasSyncReady = syncReady;
        syncReady = false;
        try {
          await persistenceQueue.catch(() => {});
          while (syncInProgress) await new Promise(resolve => setTimeout(resolve, 50));
          if (!authUser || authUser.id !== userId) throw new Error('The signed-in account changed. No reset was performed.');

          const pendingMarker = await supabaseClient.from('labels').upsert({user_id:userId,client_id:RESET_MARKER_CLIENT_ID,name:'RESET_PENDING',colour:'olive',deleted_at:null},{onConflict:'user_id,client_id'});
          if (pendingMarker.error) throw pendingMarker.error;

          const storagePaths = await listAccountStoragePaths(userId);
          for (let i = 0; i < storagePaths.length; i += 1000) {
            const removed = await supabaseClient.storage.from('memory-attachments').remove(storagePaths.slice(i, i + 1000));
            if (removed.error) throw removed.error;
          }

          for (const table of ['note_labels', 'attachments', 'notes', 'folders']) {
            const result = await supabaseClient.from(table).delete().eq('user_id', userId);
            if (result.error) throw result.error;
          }
          const deleteLabels = await supabaseClient.from('labels').delete().eq('user_id', userId).neq('client_id', RESET_MARKER_CLIENT_ID);
          if (deleteLabels.error) throw deleteLabels.error;
          const completeMarker = await supabaseClient.from('labels').upsert({user_id:userId,client_id:RESET_MARKER_CLIENT_ID,name:'RESET_COMPLETE',colour:'olive',deleted_at:null},{onConflict:'user_id,client_id'}).select('updated_at').single();
          if (completeMarker.error) throw completeMarker.error;
          const resetAt = completeMarker.data.updated_at;

          const retainedTheme = state.theme === 'dark' ? 'dark' : 'light';
          await deleteDatabaseState(activeStorageKey);
          state = normalizeState({ ...getDefaultData(), theme: retainedTheme, syncMeta: { accountResetAt: resetAt } });
          lastSavedState = cloneData(state);
          suppressDeleteDetection = true;
          const saved = await saveState();
          suppressDeleteDetection = false;
          if (!saved) throw new Error('Cloud data was erased, but the empty local workspace could not be saved. Reload Memory to finish local cleanup.');

          editingNoteId = null; editorDraft = null; clearTimeout(autoSaveTimer);
          document.getElementById('editor-overlay').classList.add('hidden');
          currentView = 'home'; activeFolderId = null; activeLabelId = null; searchQuery = '';
          selectionMode = false; selectedIds.clear();
          syncStatus = 'synced'; syncError = '';
          applyTheme(); renderAll();
          showToast('Memory reset. Your Google account is still signed in.');
        } catch (error) {
          console.error('Memory account reset failed:', error);
          syncStatus = 'error';
          syncError = error.message || 'Account reset failed';
          showToast('Reset could not finish. Open Settings and try again.');
          if (currentView === 'settings') renderMain();
        } finally {
          suppressDeleteDetection = false;
          syncReady = wasSyncReady && !!authUser && authUser.id === userId;
          resetInProgress = false;
        }
      }

      let installPromptEvent = null;
      function renderSettingsView(container) {
        container.innerHTML = `
          <div class="max-w-xl">
            <div class="mb-5"><h1 class="text-xl font-semibold tracking-tight">Settings</h1></div>
            <div class="py-4 border-y border-muted">
              <div class="text-sm font-medium">Memory account</div>
              <div id="account-status" class="text-xs text-muted mt-1" role="status" aria-live="polite">${!authReady ? "Checking account status…" : (authUser ? "Signed in as " + escapeHtml(authUser.email || "Google account") : "Not signed in")}</div>
              <div class="text-xs text-muted mt-1">${!authReady ? 'Checking account session…' : (authUser ? (syncStatus === 'syncing' ? 'Syncing notes…' : syncStatus === 'synced' ? 'Last sync completed. Tap Sync to refresh from the cloud.' : syncStatus === 'error' ? 'Sync needs attention: ' + escapeHtml(syncError) : 'Initial cloud sync is required before editing.') : 'Sign in to sync notes across devices. Local notes remain on this device.')}</div>
              ${authUser ? '<div id="realtime-status" class="text-[11px] text-muted mt-1" role="status" aria-live="polite">' + (realtimeStatus === 'connected' ? 'Cloud change notifications connected. Tap Sync to retrieve changes.' : realtimeStatus === 'disconnected' ? 'Live updates disconnected. Tap Sync to check for cloud changes.' : 'Connecting to live updates…') + '</div>' : ''}
              <button id="google-account-btn" type="button" class="mt-3 px-3.5 py-2 rounded-xl btn-olive text-xs font-medium">${authUser ? "Sign out" : "Continue with Google"}</button>
              <div class="text-[11px] text-muted mt-2">Google OAuth must first be enabled in the Memory Supabase project with your Google client ID and secret.</div>
            </div>
            <div class="divide-y border-y border-muted">
              <div class="py-4 flex items-center justify-between gap-4">
                <div><div class="text-sm font-medium">Appearance</div><div class="text-xs text-muted mt-0.5">Choose light or dark theme</div></div>
                <button id="settings-theme-btn" type="button" class="px-3.5 py-2 rounded-xl border border-muted hover:bg-surface text-xs font-medium">${state.theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</button>
              </div>
              <div class="py-4 flex items-center justify-between gap-4">
                <div><div class="text-sm font-medium">Install Memory</div><div class="text-xs text-muted mt-0.5">On iPad use Safari Share → Add to Home Screen; on Android or desktop use Install app</div></div>
                <button id="install-pwa-btn" type="button" class="px-3.5 py-2 rounded-xl border border-muted hover:bg-surface text-xs font-medium">${installPromptEvent ? 'Install' : 'Install options'}</button>
              </div>
              <div class="py-4">
                <div class="text-sm font-medium">Reset Memory</div>
                <div class="text-xs text-muted mt-0.5">Permanently erase this signed-in Google account's notes, folders, labels, and attached files from this device and cloud. Other devices clear their offline copies on their next sync. Your Google account stays signed in.</div>
                <button id="reset-memory-btn" type="button" class="mt-3 px-3.5 py-2 rounded-xl border border-red-500/40 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-500/10">Reset Memory</button>
              </div>
              <div class="py-4">
                <div class="text-sm font-medium">Backup & Restore</div>
                <div class="text-xs text-muted mt-0.5">Export notes and actual attached files in one backup, or restore a previous backup.</div>
                <div class="flex flex-wrap items-center gap-2 pt-3">
                  <button id="export-json-btn" type="button" class="px-3.5 py-2 rounded-xl btn-olive text-xs font-medium inline-flex items-center gap-1.5"><i data-lucide="download" class="w-3.5 h-3.5"></i> Export complete backup</button>
                  <label class="px-3.5 py-2 rounded-xl border border-muted hover:bg-surface text-xs font-medium cursor-pointer inline-flex items-center gap-1.5"><i data-lucide="upload" class="w-3.5 h-3.5"></i> Import backup<input id="import-json-input" type="file" accept="application/json,.json" class="hidden" /></label>
                </div>
              </div>
            </div>
          </div>
        `;

        document.getElementById('settings-theme-btn').addEventListener('click', toggleTheme);
        document.getElementById('install-pwa-btn').addEventListener('click', async () => {
          if (installPromptEvent) {
            installPromptEvent.prompt();
            await installPromptEvent.userChoice;
            installPromptEvent = null;
            renderMain();
          } else {
            showToast('On iPad, use Safari Share → Add to Home Screen. On Android or desktop, use your browser menu → Install app / Add to Home Screen.');
          }
        });
        document.getElementById('export-json-btn').addEventListener('click', exportCompleteBackup);
        const resetButton = document.getElementById('reset-memory-btn');
        if (resetButton) resetButton.addEventListener('click', resetCurrentAccountData);
        document.getElementById('import-json-input').addEventListener('change', importCompleteBackup);
        document.getElementById('google-account-btn').addEventListener('click', handleGoogleAccountAction);
      }

      function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('Could not read attachment for backup.'));
          reader.readAsDataURL(blob);
        });
      }

      function dataUrlToBlob(dataUrl) {
        const [meta, base64] = String(dataUrl).split(',');
        const mime = (meta.match(/^data:([^;]+)/) || [])[1] || 'application/octet-stream';
        const binary = atob(base64 || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      }

      async function exportCompleteBackup() {
        try {
          await persistenceQueue;
          const backup = cloneData(state);
          for (const note of backup.notes) {
            for (const attachment of (note.attachments || [])) {
              const blob = attachment.blob || attachment.fileBlob;
              if (blob instanceof Blob) {
                attachment.dataUrl = await blobToDataUrl(blob);
                delete attachment.blob; delete attachment.fileBlob;
              }
            }
          }
          const payload = { format: 'memory-complete-backup', version: 2, exportedAt: new Date().toISOString(), state: backup };
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `memory-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast('Complete backup exported');
        } catch (error) { console.error(error); showToast('Backup export failed'); }
      }

      async function importCompleteBackup(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          const imported = parsed && parsed.state ? parsed.state : parsed;
          if (!imported || !Array.isArray(imported.notes) || !Array.isArray(imported.folders) || !Array.isArray(imported.labels)) throw new Error('Invalid backup structure');
          for (const note of imported.notes) {
            for (const attachment of (note.attachments || [])) {
              if (attachment.dataUrl) { attachment.blob = dataUrlToBlob(attachment.dataUrl); delete attachment.dataUrl; }
            }
          }
          state = normalizeState(imported);
          await saveState(); applyTheme(); renderAll(); showToast('Backup restored');
        } catch (error) { console.error(error); showToast('Could not restore this backup'); }
        finally { event.target.value = ''; }
      }

      // --- CARD INTERACTIONS: TAP, LONG-PRESS, HANDLE-ONLY DRAG ---
      function bindMainEvents() {
        const quickBtn = document.getElementById('quick-capture-btn');
        if (quickBtn) {
          quickBtn.addEventListener('click', () => openEditor(null));
        }

        const backFolders = document.getElementById('back-to-folders-btn');
        if (backFolders) {
          backFolders.addEventListener('click', () => {
            activeFolderId = null;
            renderAll();
          });
        }

        const backLabels = document.getElementById('back-to-labels-btn');
        if (backLabels) {
          backLabels.addEventListener('click', () => {
            activeLabelId = null;
            renderAll();
          });
        }

        const emptyTrashBtn = document.getElementById('empty-trash-btn');
        if (emptyTrashBtn) {
          emptyTrashBtn.addEventListener('click', () => {
            const count = state.notes.filter(n => n.trashed).length;
            openConfirm({
              title: 'Empty Trash?',
              message: `Permanently delete ${count} ${count === 1 ? 'note' : 'notes'}? This cannot be undone.`,
              destructive: true,
              onConfirm: () => {
                state.notes = state.notes.filter(n => !n.trashed);
                saveState();
                renderAll();
                showToast('Trash emptied');
              }
            });
          });
        }

        document.querySelectorAll('[data-note-id]').forEach(card => {
          const id = card.getAttribute('data-note-id');
          let pressTimer = null;
          let longPressed = false;

          const handle = card.querySelector('.drag-handle');
          if (handle) {
            handle.addEventListener('pointerdown', e => {
              e.stopPropagation();
              allowDragFromHandle = true;
              if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                const start = { id, x: e.clientX, y: e.clientY, active: false, targetId: null };
                handle.setPointerCapture?.(e.pointerId);
                const move = ev => {
                  if (!start.active && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 7) return;
                  start.active = true;
                  card.classList.add('is-dragging');
                  const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-note-id]');
                  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                  if (under && under.getAttribute('data-note-id') !== id) {
                    const a = state.notes.find(n => n.id === id); const b = state.notes.find(n => n.id === under.getAttribute('data-note-id'));
                    if (a && b && a.pinned === b.pinned) { start.targetId = b.id; under.classList.add('drag-over'); }
                  }
                };
                const finish = () => {
                  handle.removeEventListener('pointermove', move);
                  handle.removeEventListener('pointerup', finish);
                  handle.removeEventListener('pointercancel', finish);
                  card.classList.remove('is-dragging');
                  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                  if (start.active && start.targetId) reorderNotes(start.id, start.targetId);
                  allowDragFromHandle = false;
                };
                handle.addEventListener('pointermove', move);
                handle.addEventListener('pointerup', finish);
                handle.addEventListener('pointercancel', finish);
              }
            });
            handle.addEventListener('pointerup', e => {
              if (e.pointerType === 'mouse' && !draggingNoteId) allowDragFromHandle = false;
            });
            handle.addEventListener('click', e => e.stopPropagation());
          }

          card.addEventListener('pointerdown', e => {
            if (e.target.closest('.drag-handle')) return;
            allowDragFromHandle = false;
            longPressed = false;
            pressTimer = setTimeout(() => {
              longPressed = true;
              if (!selectionMode) {
                selectionMode = true;
                selectedIds.clear();
              }
              toggleSelection(id);
            }, 450);
          });

          const cancelPress = () => {
            if (pressTimer) {
              clearTimeout(pressTimer);
              pressTimer = null;
            }
          };

          card.addEventListener('pointerup', cancelPress);
          card.addEventListener('pointerleave', cancelPress);
          card.addEventListener('pointercancel', cancelPress);

          card.addEventListener('keydown', e => {
            if (e.target !== card || e.target.closest('.drag-handle')) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (selectionMode) toggleSelection(id);
              else openEditor(id);
            }
          });

          card.addEventListener('click', e => {
            if (e.target.closest('.drag-handle')) return;
            if (longPressed) {
              longPressed = false;
              return;
            }
            if (selectionMode) {
              toggleSelection(id);
            } else {
              openEditor(id);
            }
          });

          // Handle-only drag & drop
          card.addEventListener('dragstart', e => {
            if (!allowDragFromHandle || selectionMode) {
              e.preventDefault();
              return;
            }
            draggingNoteId = id;
            card.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
          });

          card.addEventListener('dragend', () => {
            draggingNoteId = null;
            allowDragFromHandle = false;
            card.classList.remove('is-dragging');
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
          });

          card.addEventListener('dragover', e => {
            if (!draggingNoteId || draggingNoteId === id) return;
            const dragged = state.notes.find(n => n.id === draggingNoteId);
            const target = state.notes.find(n => n.id === id);
            if (!dragged || !target || dragged.pinned !== target.pinned) return;
            e.preventDefault();
            card.classList.add('drag-over');
          });

          card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
          });

          card.addEventListener('drop', e => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (!draggingNoteId || draggingNoteId === id) return;
            reorderNotes(draggingNoteId, id);
          });
        });
      }

      function reorderNotes(sourceId, targetId) {
        const source = state.notes.find(n => n.id === sourceId);
        const target = state.notes.find(n => n.id === targetId);
        if (!source || !target || source.pinned !== target.pinned) return;

        const group = state.notes
          .filter(n => !n.archived && !n.trashed && n.pinned === source.pinned)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        const fromIdx = group.findIndex(n => n.id === sourceId);
        const toIdx = group.findIndex(n => n.id === targetId);
        if (fromIdx === -1 || toIdx === -1) return;

        const [moved] = group.splice(fromIdx, 1);
        group.splice(toIdx, 0, moved);
        group.forEach((n, idx) => {
          n.order = (source.pinned ? 1 : 1000) + idx;
        });

        saveState();
        renderAll();
      }

      // --- MULTI-SELECT & BULK TOOLBAR ---
      function toggleSelection(id) {
        if (selectedIds.has(id)) {
          selectedIds.delete(id);
        } else {
          selectedIds.add(id);
        }
        if (selectedIds.size === 0) {
          selectionMode = false;
        }
        renderAll();
      }

      function exitSelectionMode() {
        selectionMode = false;
        selectedIds.clear();
        document.getElementById('bulk-colour-popover').classList.add('hidden');
        renderBulkToolbar();
      }

      function renderBulkToolbar() {
        const bar = document.getElementById('bulk-toolbar');
        const popover = document.getElementById('bulk-colour-popover');
        if (!selectionMode || selectedIds.size === 0) {
          bar.classList.add('hidden');
          popover.classList.add('hidden');
          return;
        }

        bar.classList.remove('hidden');
        const count = selectedIds.size;
        document.getElementById('bulk-count').textContent = `${count} selected`;

        const container = document.getElementById('bulk-actions-container');
        if (currentView === 'trash') {
          container.innerHTML = `
            <button type="button" id="bulk-restore-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1.5">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Restore
            </button>
            <button type="button" id="bulk-perm-delete-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1.5" style="color: var(--accent-clay);">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete forever
            </button>
          `;
          document.getElementById('bulk-restore-btn').addEventListener('click', () => {
            state.notes.forEach(n => {
              if (selectedIds.has(n.id)) n.trashed = false;
            });
            saveState();
            exitSelectionMode();
            renderAll();
            showToast(`Restored ${count} ${count === 1 ? 'note' : 'notes'}`);
          });
          document.getElementById('bulk-perm-delete-btn').addEventListener('click', () => {
            openConfirm({
              title: 'Delete permanently?',
              message: `Permanently delete ${count} selected ${count === 1 ? 'note' : 'notes'}? This cannot be undone.`,
              destructive: true,
              onConfirm: () => {
                state.notes = state.notes.filter(n => !selectedIds.has(n.id));
                saveState();
                exitSelectionMode();
                renderAll();
                showToast(`Permanently deleted ${count} ${count === 1 ? 'note' : 'notes'}`);
              }
            });
          });
        } else if (currentView === 'archive') {
          container.innerHTML = `
            <button type="button" id="bulk-unarchive-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1.5">
              <i data-lucide="archive-restore" class="w-3.5 h-3.5"></i> Restore
            </button>
            <button type="button" id="bulk-delete-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1.5" style="color: var(--accent-clay);">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete
            </button>
          `;
          document.getElementById('bulk-unarchive-btn').addEventListener('click', () => {
            state.notes.forEach(n => {
              if (selectedIds.has(n.id)) n.archived = false;
            });
            saveState();
            exitSelectionMode();
            renderAll();
            showToast(`Restored ${count} ${count === 1 ? 'note' : 'notes'} to Home`);
          });
          document.getElementById('bulk-delete-btn').addEventListener('click', () => confirmBulkDelete(count));
        } else {
          // Active board bulk toolbar: Pin | Colour | Archive | Move | Delete
          const selectedNotes = state.notes.filter(n => selectedIds.has(n.id));
          const allPinned = selectedNotes.every(n => n.pinned);

          container.innerHTML = `
            <button type="button" id="bulk-pin-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1">
              <i data-lucide="pin" class="w-3.5 h-3.5"></i><span>${allPinned ? 'Unpin' : 'Pin'}</span>
            </button>
            <button type="button" id="bulk-colour-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1">
              <i data-lucide="palette" class="w-3.5 h-3.5"></i><span>Colour</span>
            </button>
            <button type="button" id="bulk-archive-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1">
              <i data-lucide="archive" class="w-3.5 h-3.5"></i><span>Archive</span>
            </button>
            <button type="button" id="bulk-move-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1">
              <i data-lucide="folder-input" class="w-3.5 h-3.5"></i><span>Move</span>
            </button>
            <button type="button" id="bulk-delete-btn" class="px-2.5 py-1.5 rounded-xl hover:bg-surface text-xs font-medium inline-flex items-center gap-1" style="color: var(--accent-clay);">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>Delete</span>
            </button>
          `;

          // Immediate: Pin / Unpin
          document.getElementById('bulk-pin-btn').addEventListener('click', () => {
            const targetPin = !allPinned;
            state.notes.forEach(n => {
              if (selectedIds.has(n.id)) n.pinned = targetPin;
            });
            saveState();
            exitSelectionMode();
            renderAll();
            showToast(targetPin ? `Pinned ${count} ${count === 1 ? 'note' : 'notes'}` : `Unpinned ${count} ${count === 1 ? 'note' : 'notes'}`);
          });

          // Immediate: Change colour
          document.getElementById('bulk-colour-btn').addEventListener('click', () => {
            popover.classList.toggle('hidden');
            renderSwatches('bulk-colour-swatches', null, colourId => {
              state.notes.forEach(n => {
                if (selectedIds.has(n.id)) n.colour = colourId;
              });
              saveState();
              exitSelectionMode();
              renderAll();
              showToast(`Updated colour for ${count} ${count === 1 ? 'note' : 'notes'}`);
            });
          });

          // Archive is immediate for both individual and bulk actions.
          document.getElementById('bulk-archive-btn').addEventListener('click', () => {
            state.notes.forEach(n => { if (selectedIds.has(n.id)) { n.archived = true; n.trashed = false; } });
            saveState(); exitSelectionMode(); renderAll();
            showToast(`Archived ${count} ${count === 1 ? 'note' : 'notes'}`);
          });

          // Confirmation required: Move to folder (shows destination folder before confirmation)
          document.getElementById('bulk-move-btn').addEventListener('click', () => {
            const optionsHtml = `
              <div class="space-y-2">
                <label for="bulk-folder-select" class="block text-xs font-medium text-main">Destination folder</label>
                <select id="bulk-folder-select" class="w-full h-9 px-3 rounded-xl bg-main border border-muted text-sm text-main focus:outline-none">
                  <option value="">Unfiled</option>
                  ${state.folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
                </select>
                <p id="bulk-move-preview" class="text-xs text-muted"></p>
              </div>
            `;

            openConfirm({
              title: 'Move notes to folder?',
              message: `Choose a destination folder for ${count} selected ${count === 1 ? 'note' : 'notes'}.`,
              extraHtml: optionsHtml,
              onOpen: () => {
                const sel = document.getElementById('bulk-folder-select');
                const preview = document.getElementById('bulk-move-preview');
                const updatePreview = () => {
                  const chosen = state.folders.find(f => f.id === sel.value);
                  preview.textContent = chosen
                    ? `Destination: ${chosen.name}`
                    : 'Destination: Unfiled';
                };
                sel.addEventListener('change', updatePreview);
                updatePreview();
              },
              onConfirm: () => {
                const sel = document.getElementById('bulk-folder-select');
                const folderId = sel ? sel.value : '';
                const chosen = state.folders.find(f => f.id === folderId);
                state.notes.forEach(n => {
                  if (selectedIds.has(n.id)) n.folderId = folderId;
                });
                saveState();
                exitSelectionMode();
                renderAll();
                showToast(chosen ? `Moved ${count} ${count === 1 ? 'note' : 'notes'} to ${chosen.name}` : `Moved ${count} ${count === 1 ? 'note' : 'notes'} to Unfiled`);
              }
            });
          });

          // Confirmation required: Delete
          document.getElementById('bulk-delete-btn').addEventListener('click', () => confirmBulkDelete(count));
        }

        refreshIcons();
      }

      function confirmBulkDelete(count) {
        openConfirm({
          title: 'Move notes to Trash?',
          message: `${count} selected ${count === 1 ? 'note' : 'notes'} will be moved to Trash. You can restore them later from Trash.`,
          destructive: true,
          onConfirm: () => {
            state.notes.forEach(n => {
              if (selectedIds.has(n.id)) {
                n.trashed = true;
                n.archived = false;
              }
            });
            saveState();
            exitSelectionMode();
            renderAll();
            showToast(`Moved ${count} ${count === 1 ? 'note' : 'notes'} to Trash`);
          }
        });
      }

      function renderSwatches(containerId, activeId, onPick) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const isDark = state.theme === 'dark';
        el.innerHTML = NOTE_COLOURS.map(c => {
          const bg = isDark ? c.swatchDark : c.swatchLight;
          const active = c.id === activeId;
          return `
            <button
              type="button"
              data-colour="${c.id}"
              title="${c.label}"
              aria-label="${c.label}"
              class="w-6 h-6 rounded-full border flex items-center justify-center transition-transform hover:scale-105"
              style="background-color: ${bg}; border-color: ${active ? 'var(--accent-olive)' : 'var(--border-strong)'}; ${active ? 'box-shadow: 0 0 0 2px var(--accent-olive);' : ''}"
            >
              ${active ? '<i data-lucide="check" class="w-3 h-3 text-main"></i>' : ''}
            </button>
          `;
        }).join('');
        el.querySelectorAll('[data-colour]').forEach(btn => {
          btn.addEventListener('click', () => onPick(btn.getAttribute('data-colour')));
        });
        refreshIcons();
      }

      async function fetchLinkMetadata(noteId, linkId, url) {
        try {
          if (!navigator.onLine) return;
          // The CSP intentionally blocks arbitrary cross-origin fetches. Keep the URL usable and stop retrying metadata requests the policy must reject.
          if (new URL(url, window.location.href).origin !== window.location.origin) {
            const note = state.notes.find(n => n.id === noteId);
            const link = note && (note.links || []).find(l => l.id === linkId);
            if (link) { link.metadataPending = false; saveState(); }
            if (editorDraft && editorDraft.id === noteId) {
              const draftLink = (editorDraft.links || []).find(l => l.id === linkId);
              if (draftLink) { draftLink.metadataPending = false; renderEditorLinks(); }
            }
            return;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6500);
          const response = await fetch(url, { signal: controller.signal, mode: 'cors' });
          clearTimeout(timeout);
          if (!response.ok) throw new Error('Website did not return a readable page');
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const title = doc.querySelector('meta[property="og:title"]')?.content || doc.querySelector('meta[name="twitter:title"]')?.content || doc.title || '';
          updateLinkMetadata(noteId, linkId, title.trim());
        } catch (error) {
          // Cross-origin restrictions are common. Keep the URL and retry on reconnect.
          const note = state.notes.find(n => n.id === noteId);
          const link = note && (note.links || []).find(l => l.id === linkId);
          if (link) { link.metadataPending = true; saveState(); }
          if (editorDraft && editorDraft.id === noteId) {
            const draftLink = (editorDraft.links || []).find(l => l.id === linkId);
            if (draftLink) { draftLink.metadataPending = true; renderEditorLinks(); }
          }
        }
      }

      function updateLinkMetadata(noteId, linkId, title) {
        if (!title) return;
        const note = state.notes.find(n => n.id === noteId);
        if (note) {
          const link = (note.links || []).find(l => l.id === linkId);
          if (link && !link.titleLocked) { link.title = title; link.metadataPending = false; saveState(); }
        }
        if (editorDraft && editorDraft.id === noteId) {
          const link = (editorDraft.links || []).find(l => l.id === linkId);
          if (link && !link.titleLocked) { link.title = title; link.metadataPending = false; renderEditorLinks(); persistEditorDraft(); }
        }
      }

      async function retryPendingLinkMetadata() {
        if (!navigator.onLine) return;
        const jobs = [];
        state.notes.forEach(note => (note.links || []).forEach(link => {
          if (link.metadataPending) jobs.push(fetchLinkMetadata(note.id, link.id, link.url));
        }));
        await Promise.allSettled(jobs);
      }

      // --- NOTE EDITOR ---
      function openEditor(noteId) {
        if (!noteId && !canEditCloudData()) { showToast('Connect and sync Memory before creating a note.'); return; }
        formattingBarOpen = false;
        document.getElementById('formatting-bar').classList.add('hidden');
        document.getElementById('add-link-bar').classList.add('hidden');
        document.getElementById('editor-more-menu').classList.add('hidden');

        const existing = noteId ? state.notes.find(n => n.id === noteId) : null;
        if (noteId && !existing) return;
        editingNoteId = noteId ? existing.id : 'NEW';
        const maxOrder = state.notes.reduce((m, n) => Math.max(m, n.order || 0), 0);
        editorDraft = MemoryNoteEditor.createDraft(existing, {
          id: uid('n'),
          order: maxOrder + 1,
          folderId: currentView === 'folders' && activeFolderId && activeFolderId !== '__unfiled__' ? activeFolderId : '',
          labelIds: currentView === 'labels' && activeLabelId ? [activeLabelId] : [],
          createdAt: Date.now()
        }, cloneData);

        const titleEl = document.getElementById('editor-title');
        const bodyEl = document.getElementById('editor-body');
        titleEl.value = editorDraft.title || '';
        editorDraft.bodyHtml = sanitizeNoteHtml(editorDraft.bodyHtml || '');
        bodyEl.innerHTML = editorDraft.bodyHtml;
        const created = new Date(editorDraft.createdAt || Date.now());
        document.getElementById('editor-created-date').textContent = created.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

        applyEditorVisuals();
        renderEditorChecklist();
        renderEditorLinks();
        renderEditorAttachments();
        renderEditorMoreMenu();

        editorReturnFocus = document.activeElement;
        editorReturnNoteId = editorReturnFocus && editorReturnFocus.getAttribute ? editorReturnFocus.getAttribute('data-note-id') : null;
        document.getElementById('editor-overlay').classList.remove('hidden');
        document.getElementById('editor-dialog-title').textContent = titleEl.value.trim() || 'Untitled note';
        (noteId ? titleEl : bodyEl).focus();
        if (syncInProgress) registerEditorForActiveSync();
        applyReadOnlyMode();
        refreshIcons();
      }

      function isDraftEmpty() { return MemoryNoteEditor.isDraftEmpty(editorDraft, stripHtml); }

      function persistEditorDraft() {
        if (!editorDraft || !canEditCloudData()) return;
        editorDraft.title = document.getElementById('editor-title').value;
        editorDraft.bodyHtml = captureEditorBodyHtml();

        if (isDraftEmpty()) {
          document.getElementById('editor-save-status').textContent = 'Empty note (not saved)';
          return;
        }

        // Editing does NOT change note.order or move it to the top
        const idx = state.notes.findIndex(n => n.id === editorDraft.id);
        if (idx === -1) {
          state.notes.push(cloneData(editorDraft));
          editingNoteId = editorDraft.id;
        } else {
          state.notes[idx] = cloneData(editorDraft);
        }
        const noteId = editorDraft.id;
        document.getElementById('editor-save-status').textContent = 'Saving…';
        saveState().then(ok => {
          if (editorDraft && editorDraft.id === noteId && !document.getElementById('editor-overlay').classList.contains('hidden')) {
            document.getElementById('editor-save-status').textContent = ok ? 'Saved on this device' : 'Save failed';
          }
        });
      }

      function scheduleAutoSave() {
        if (!canEditCloudData()) return;
        document.getElementById('editor-save-status').textContent = 'Saving…';
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
          persistEditorDraft();
          renderNav();
          renderMain();
        }, 280);
      }

      function closeEditor() {
        closeAttachmentMenu({ restoreFocus: false });
        if (attachmentRenameTargetId) cancelAttachmentRename(false);
        clearTimeout(autoSaveTimer);
        if (syncInProgress && editorDraft && activeSyncEditorDrafts) {
          const closingDraft = captureOpenEditorDraft();
          const record = activeSyncEditorDrafts.get(closingDraft.id);
          if (record) { record.current = cloneData(closingDraft); record.open = false; }
        }
        if (editorDraft && canEditCloudData()) {
          editorDraft.title = document.getElementById('editor-title').value;
          editorDraft.bodyHtml = captureEditorBodyHtml();
          if (!isDraftEmpty()) {
            persistEditorDraft();
          } else if (editingNoteId !== 'NEW') {
            // If an existing note was completely cleared, remove it rather than keeping an empty note
            state.notes = state.notes.filter(n => n.id !== editorDraft.id);
            saveState();
          }
        }
        editingNoteId = null;
        editorDraft = null;
        document.getElementById('editor-overlay').classList.add('hidden');
        document.getElementById('editor-more-menu').classList.add('hidden');
        document.getElementById('editor-more-btn').setAttribute('aria-expanded', 'false');
        renderAll();
        const returnCard = editorReturnNoteId ? document.querySelector('[data-note-id="' + editorReturnNoteId + '"]') : null;
        if (returnCard) returnCard.focus();
        else if (editorReturnFocus && editorReturnFocus.isConnected && editorReturnFocus.focus) editorReturnFocus.focus();
        else if (document.getElementById('quick-capture-btn')) document.getElementById('quick-capture-btn').focus();
        else document.getElementById('main-content').focus();
        editorReturnFocus = null;
        editorReturnNoteId = null;
      }

      function applyEditorVisuals() {
        const panel = document.getElementById('editor-panel');
        NOTE_COLOURS.forEach(c => panel.classList.remove(c.cls));
        panel.classList.add(getColourClass(editorDraft.colour));

        document.getElementById('editor-pinned-badge').classList.toggle('hidden', !editorDraft.pinned);

        const folder = state.folders.find(f => f.id === editorDraft.folderId);
        const folderPill = document.getElementById('editor-folder-pill');
        if (folder) {
          folderPill.textContent = folder.name;
          folderPill.classList.remove('hidden');
        } else {
          folderPill.classList.add('hidden');
        }

        const labelPills = document.getElementById('editor-label-pills');
        const activeLabels = (editorDraft.labelIds || [])
          .map(lid => state.labels.find(l => l.id === lid))
          .filter(Boolean);
        labelPills.innerHTML = activeLabels
          .map(l => { const c = labelColour(l); return `<span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style="background:${state.theme === 'dark' ? c.dark : c.light};color:var(--text-main);">#${escapeHtml(l.name)}</span>`; })
          .join('');
      }

      function renderEditorChecklist() {
        const section = document.getElementById('editor-checklist-section');
        const list = document.getElementById('editor-checklist-items');
        const items = editorDraft.checklist || [];

        if (items.length === 0) {
          section.classList.add('hidden');
          list.innerHTML = '';
          return;
        }

        section.classList.remove('hidden');
        list.innerHTML = items.map(item => `
          <div class="checklist-row flex items-center gap-2.5 group" data-check-id="${item.id}">
            <input type="checkbox" ${item.done ? 'checked' : ''} class="shrink-0" aria-label="${item.done ? 'Mark incomplete' : 'Mark complete'}: ${escapeHtml(item.text || 'Checklist item')}" />
            <input
              type="text"
              value="${escapeHtml(item.text)}"
              placeholder="Checklist item"
              aria-label="Checklist item text"
              class="flex-1 bg-transparent text-sm text-main focus:outline-none ${item.done ? 'checklist-done' : ''}"
            />
            <button type="button" class="remove-check-btn opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-main" aria-label="Remove item">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `).join('');

        list.querySelectorAll('.checklist-row').forEach(row => {
          const cid = row.getAttribute('data-check-id');
          const checkbox = row.querySelector('input[type="checkbox"]');
          const textInput = row.querySelector('input[type="text"]');
          const rmBtn = row.querySelector('.remove-check-btn');

          checkbox.addEventListener('change', () => {
            const target = editorDraft.checklist.find(c => c.id === cid);
            if (!target) return;
            editorDraft.checklist = MemoryNoteEditor.setChecklistDone(editorDraft.checklist, cid, checkbox.checked);
            // Completed items stay in their original position with strikethrough
            textInput.classList.toggle('checklist-done', target.done);
            scheduleAutoSave();
          });

          textInput.addEventListener('input', () => {
            const target = editorDraft.checklist.find(c => c.id === cid);
            if (!target) return;
            editorDraft.checklist = MemoryNoteEditor.setChecklistText(editorDraft.checklist, cid, textInput.value);
            scheduleAutoSave();
          });

          textInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addChecklistItem();
            }
          });

          rmBtn.addEventListener('click', () => {
            editorDraft.checklist = MemoryNoteEditor.removeChecklistItem(editorDraft.checklist, cid);
            renderEditorChecklist();
            scheduleAutoSave();
          });
        });

        refreshIcons();
      }

      function addChecklistItem() {
        editorDraft.checklist = editorDraft.checklist || [];
        const newId = uid('c');
        editorDraft.checklist = MemoryNoteEditor.appendChecklistItem(editorDraft.checklist, newId);
        renderEditorChecklist();
        const input = document.querySelector(`[data-check-id="${newId}"] input[type="text"]`);
        if (input) input.focus();
        scheduleAutoSave();
      }

      function renderEditorLinks() {
        const section = document.getElementById('editor-links-section');
        const list = document.getElementById('editor-links-list');
        const links = editorDraft.links || [];

        if (links.length === 0) {
          section.classList.add('hidden');
          list.innerHTML = '';
          return;
        }

        section.classList.remove('hidden');
        list.innerHTML = links.map(lk => `
          <div class="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] border border-muted">
            <button type="button" data-open-link="${lk.id}" aria-label="Preview ${escapeHtml(lk.title || lk.domain)} in Memory" class="min-w-0 flex-1 text-left py-1 hover:opacity-80" style="min-height:44px">
              <span class="block text-xs font-medium text-main truncate">${escapeHtml(lk.title || lk.domain)}</span>
              <span class="block text-[11px] text-muted truncate">${escapeHtml(lk.domain)}${lk.metadataPending ? ' · title pending' : ''}</span>
            </button>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" data-edit-link="${lk.id}" aria-label="Edit title for ${escapeHtml(lk.title || lk.domain)}" class="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-muted hover:text-main" title="Edit displayed title"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
              <button type="button" data-remove-link="${lk.id}" aria-label="Remove ${escapeHtml(lk.title || lk.domain)}" class="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-muted hover:text-main" title="Remove link"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
            </div>
          </div>
        `).join('');

        list.querySelectorAll('[data-open-link]').forEach(btn => btn.addEventListener('click', () => {
          const link = (editorDraft.links || []).find(l => l.id === btn.getAttribute('data-open-link'));
          if (link) openLinkPreview(link);
        }));
        list.querySelectorAll('[data-edit-link]').forEach(btn => btn.addEventListener('click', () => {
          const link = (editorDraft.links || []).find(l => l.id === btn.getAttribute('data-edit-link'));
          if (!link) return;
          const nextTitle = window.prompt('Displayed website title', link.title || link.domain);
          if (nextTitle === null) return;
          const cleaned = nextTitle.trim();
          if (!cleaned) { showToast('Website title cannot be empty'); return; }
          link.title = cleaned; link.titleLocked = true; link.metadataPending = false;
          renderEditorLinks(); scheduleAutoSave();
        }));
        list.querySelectorAll('[data-remove-link]').forEach(btn => {
          btn.addEventListener('click', () => {
            const lid = btn.getAttribute('data-remove-link');
            editorDraft.links = editorDraft.links.filter(l => l.id !== lid);
            renderEditorLinks();
            scheduleAutoSave();
          });
        });

        refreshIcons();
      }

      let activeAttachmentMenu = null;
      let attachmentRenameTargetId = null;

      function renderEditorAttachments() {
        closeAttachmentMenu({ restoreFocus: false });
        const section = document.getElementById('editor-attachments-section');
        const list = document.getElementById('editor-attachments-list');
        const attachments = editorDraft.attachments || [];
        if (!attachments.length) { section.classList.add('hidden'); list.innerHTML = ''; return; }
        section.classList.remove('hidden');
        list.innerHTML = attachments.map(att => {
          const id = escapeHtml(att.id);
          const fileName = escapeHtml(att.name || 'Attachment');
          const fileType = escapeHtml(att.type || 'FILE');
          const fileSize = escapeHtml(att.size || '');
          return '<div class="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] border border-muted">' +
            '<button type="button" data-preview-att="' + id + '" class="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-80">' +
              '<span class="w-7 h-7 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 text-muted"><i data-lucide="' +
                (['PNG','JPG','JPEG','WEBP','GIF','SVG','AVIF'].includes(att.type) ? 'image' : 'file-text') +
              '" class="w-3.5 h-3.5"></i></span>' +
              '<span class="min-w-0"><span class="block text-xs font-medium text-main truncate">' + fileName +
              '</span><span class="block text-[11px] text-muted">' + fileType + ' · ' + fileSize + '</span></span>' +
            '</button>' +
            '<button type="button" data-att-menu="' + id + '" aria-haspopup="menu" aria-expanded="false" aria-label="Options for ' + fileName +
              '" class="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-muted hover:text-main shrink-0" style="min-width:44px;min-height:44px" title="Attachment options">' +
              '<i data-lucide="more-vertical" class="w-3.5 h-3.5"></i></button>' +
          '</div>';
        }).join('');

        list.querySelectorAll('[data-preview-att]').forEach(btn => btn.addEventListener('click', () => openAttachmentPreview(btn.getAttribute('data-preview-att'))));
        list.querySelectorAll('[data-att-menu]').forEach(btn => btn.addEventListener('click', event => {
          event.stopPropagation();
          toggleAttachmentMenu(btn.getAttribute('data-att-menu'), btn);
        }));
        refreshIcons();
      }

      function closeAttachmentMenu(options) {
        if (!activeAttachmentMenu) return;
        const config = options || {};
        const current = activeAttachmentMenu;
        activeAttachmentMenu = null;
        current.cleanup();
        current.panel.remove();
        if (current.trigger && current.trigger.isConnected) {
          current.trigger.setAttribute('aria-expanded', 'false');
          if (config.restoreFocus) current.trigger.focus();
        }
      }

      function syncAttachmentMenuReadOnly(readOnly) {
        if (!activeAttachmentMenu) return;
        activeAttachmentMenu.panel.querySelectorAll('[data-att-menu-action]').forEach(item => {
          const action = item.getAttribute('data-att-menu-action');
          item.disabled = !!readOnly && (action === 'rename' || action === 'remove');
        });
      }

      function toggleAttachmentMenu(attachmentId, trigger) {
        if (activeAttachmentMenu && activeAttachmentMenu.trigger === trigger) {
          closeAttachmentMenu({ restoreFocus: false });
          return;
        }
        closeAttachmentMenu({ restoreFocus: false });
        const attachment = (editorDraft && editorDraft.attachments || []).find(item => item.id === attachmentId);
        if (!attachment) return;

        const panel = document.createElement('div');
        panel.id = 'attachment-menu';
        panel.setAttribute('role', 'menu');
        panel.setAttribute('aria-label', 'Options for ' + (attachment.name || 'attachment'));
        panel.className = 'rounded-xl bg-elevated border border-muted p-1';
        Object.assign(panel.style, {
          position: 'fixed', zIndex: '50', minWidth: '180px',
          maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto', boxShadow: 'var(--shadow-card)'
        });

        const readOnly = !canEditCloudData();
        [['preview', 'Preview'], ['download', 'Download'], ['rename', 'Rename'], ['remove', 'Remove']].forEach(([action, label]) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.setAttribute('role', 'menuitem');
          item.setAttribute('data-att-menu-action', action);
          item.textContent = label;
          item.className = 'w-full text-left text-xs font-medium text-main rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10';
          item.style.minHeight = '44px';
          item.disabled = readOnly && (action === 'rename' || action === 'remove');
          panel.append(item);
        });

        document.body.append(panel);
        trigger.setAttribute('aria-expanded', 'true');
        const rect = trigger.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const edge = 8;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const panelWidth = Math.min(panelRect.width, viewportWidth - edge * 2);
        const panelHeight = Math.min(panelRect.height, viewportHeight - edge * 2);
        const left = Math.max(edge, Math.min(rect.right - panelWidth, viewportWidth - panelWidth - edge));
        let top = rect.bottom + 4;
        if (top + panelHeight > viewportHeight - edge) top = rect.top - panelHeight - 4;
        top = Math.max(edge, Math.min(top, viewportHeight - panelHeight - edge));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';

        const onOutsidePointerDown = event => {
          if (!panel.contains(event.target) && !trigger.contains(event.target)) closeAttachmentMenu({ restoreFocus: false });
        };
        const onViewportChange = () => closeAttachmentMenu({ restoreFocus: false });
        const cleanup = () => {
          document.removeEventListener('pointerdown', onOutsidePointerDown, true);
          window.removeEventListener('scroll', onViewportChange, true);
          window.removeEventListener('resize', onViewportChange);
        };
        activeAttachmentMenu = { panel, trigger, cleanup };

        panel.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            closeAttachmentMenu({ restoreFocus: true });
            return;
          }
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault(); event.stopPropagation();
          const items = Array.from(panel.querySelectorAll('[role="menuitem"]:not([disabled])'));
          if (!items.length) return;
          const index = items.indexOf(document.activeElement);
          const next = event.key === 'ArrowDown'
            ? (index + 1 + items.length) % items.length
            : (index <= 0 ? items.length - 1 : index - 1);
          items[next].focus();
        });
        panel.addEventListener('click', event => {
          const item = event.target.closest('[data-att-menu-action]');
          if (!item || item.disabled) return;
          const action = item.getAttribute('data-att-menu-action');
          closeAttachmentMenu({ restoreFocus: true });
          runAttachmentMenuAction(action, attachmentId);
        });
        document.addEventListener('pointerdown', onOutsidePointerDown, true);
        window.addEventListener('scroll', onViewportChange, true);
        window.addEventListener('resize', onViewportChange);
        const firstItem = panel.querySelector('[role="menuitem"]:not([disabled])');
        if (firstItem) firstItem.focus();
      }

      function runAttachmentMenuAction(action, attachmentId) {
        const attachment = (editorDraft && editorDraft.attachments || []).find(item => item.id === attachmentId);
        if (!attachment) return;
        if (action === 'preview') openAttachmentPreview(attachmentId);
        else if (action === 'download') downloadAttachment(attachmentId);
        else if (action === 'rename') openAttachmentRename(attachmentId);
        else if (action === 'remove') {
          openConfirm({
            title: 'Remove attachment?',
            message: 'Remove “' + (attachment ? attachment.name : 'this file') + '” from the note?',
            destructive: true,
            onConfirm: () => { editorDraft.attachments = editorDraft.attachments.filter(item => item.id !== attachmentId); renderEditorAttachments(); scheduleAutoSave(); }
          });
        }
      }

      function downloadAttachment(attachmentId) {
        const attachment = (editorDraft && editorDraft.attachments || []).find(item => item.id === attachmentId);
        if (!attachment) return;
        const blob = attachment.blob || attachment.fileBlob;
        if (!(blob instanceof Blob)) {
          showToast('This older attachment has no saved file data. Please attach the file again.');
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = attachment.name || 'Attachment';
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      }

      function openAttachmentRename(attachmentId) {
        if (!canEditCloudData()) return;
        const attachment = (editorDraft && editorDraft.attachments || []).find(item => item.id === attachmentId);
        if (!attachment) return;
        attachmentRenameTargetId = attachmentId;
        const input = document.getElementById('attachment-rename-input');
        input.value = attachment.name || '';
        document.getElementById('attachment-rename-error').textContent = '';
        document.getElementById('attachment-rename-overlay').classList.remove('hidden');
        input.focus();
        input.select();
      }

      function cancelAttachmentRename(restoreFocus) {
        const attachmentId = attachmentRenameTargetId;
        attachmentRenameTargetId = null;
        document.getElementById('attachment-rename-overlay').classList.add('hidden');
        document.getElementById('attachment-rename-error').textContent = '';
        if (restoreFocus !== false && attachmentId) {
          const trigger = Array.from(document.querySelectorAll('[data-att-menu]'))
            .find(item => item.getAttribute('data-att-menu') === attachmentId);
          if (trigger) trigger.focus();
        }
      }

      function saveAttachmentRename() {
        if (!canEditCloudData() || !attachmentRenameTargetId) return;
        const attachment = (editorDraft && editorDraft.attachments || []).find(item => item.id === attachmentRenameTargetId);
        if (!attachment) { cancelAttachmentRename(false); return; }
        const cleaned = document.getElementById('attachment-rename-input').value.trim();
        let error = '';
        if (!cleaned) error = 'Enter a file name.';
        else if (cleaned.length > 120) error = 'File names must be 120 characters or fewer.';
        else if (/[\/\\\u0000-\u001f\u007f-\u009f]/.test(cleaned)) error = 'File names cannot contain /, \\, or control characters.';
        if (error) {
          document.getElementById('attachment-rename-error').textContent = error;
          document.getElementById('attachment-rename-input').focus();
          return;
        }
        const attachmentId = attachmentRenameTargetId;
        attachment.name = cleaned;
        const dot = cleaned.lastIndexOf('.');
        const extension = dot > 0 && dot < cleaned.length - 1 ? cleaned.slice(dot + 1) : '';
        attachment.type = extension ? extension.toUpperCase() : 'FILE';
        attachmentRenameTargetId = null;
        document.getElementById('attachment-rename-overlay').classList.add('hidden');
        document.getElementById('attachment-rename-error').textContent = '';
        renderEditorAttachments();
        scheduleAutoSave();
        const trigger = Array.from(document.querySelectorAll('[data-att-menu]'))
          .find(item => item.getAttribute('data-att-menu') === attachmentId);
        if (trigger) trigger.focus();
      }

      let previewObjectUrl = null;
      let previewGeneration = 0;

      function showLinkPreviewMessage(body, message) {
        const status = document.createElement('p');
        status.className = 'max-w-md text-sm text-muted p-6 text-center';
        status.setAttribute('role', 'status');
        status.textContent = message;
        body.replaceChildren(status);
      }

      function openLinkPreview(link) {
        const classification = MemoryLinkPreview.classifyLink(link && link.url);
        const generation = ++previewGeneration;
        if (previewObjectUrl) {
          URL.revokeObjectURL(previewObjectUrl);
          previewObjectUrl = null;
        }
        previewReturnFocus = document.activeElement;
        document.getElementById('file-preview-title').textContent = (link && (link.title || link.domain)) || 'Link preview';
        const download = document.getElementById('file-preview-download');
        download.classList.add('hidden');
        download.removeAttribute('href');
        download.removeAttribute('download');

        const external = document.getElementById('file-preview-external');
        external.target = '_blank';
        external.rel = 'noopener noreferrer';
        external.classList.toggle('hidden', !classification.externalUrl);
        if (classification.externalUrl) external.href = classification.externalUrl;
        else external.removeAttribute('href');

        const body = document.getElementById('file-preview-body');
        body.replaceChildren();
        document.getElementById('file-preview-overlay').classList.remove('hidden');

        if (classification.kind === 'invalid') {
          showLinkPreviewMessage(body, "This link can't be previewed or opened.");
          document.getElementById('file-preview-close').focus();
          return;
        }
        if (classification.kind === 'insecure') {
          showLinkPreviewMessage(body, "This link uses http, so it can't be previewed here. Use Open externally.");
          document.getElementById('file-preview-close').focus();
          return;
        }
        if (classification.kind === 'unsupported-file') {
          showLinkPreviewMessage(body, "This file type can't be previewed in the browser. Use Open externally.");
          document.getElementById('file-preview-close').focus();
          return;
        }

        let stage = body;
        if (classification.kind === 'page') {
          const wrapper = document.createElement('div');
          wrapper.className = 'w-full h-full min-h-0 flex flex-col';
          const hint = document.createElement('div');
          hint.className = 'px-3 py-2 text-xs text-muted border-b border-muted bg-surface shrink-0';
          hint.textContent = "Some sites don't allow previews. If this looks blank, use Open externally.";
          stage = document.createElement('div');
          stage.className = 'relative flex-1 min-h-0';
          wrapper.append(hint, stage);
          body.replaceChildren(wrapper);
        }

        const status = document.createElement('p');
        status.className = 'max-w-md text-sm text-muted p-6 text-center';
        status.setAttribute('role', 'status');
        status.textContent = navigator.onLine ? 'Loading…' : "You're offline. Link previews need a connection.";
        stage.append(status);
        if (!navigator.onLine) {
          document.getElementById('file-preview-close').focus();
          return;
        }

        let sameOrigin = false;
        try { sameOrigin = new URL(classification.src).origin === window.location.origin; } catch (_) {}
        const loaded = element => {
          if (generation !== previewGeneration) return;
          status.remove();
          element.hidden = false;
        };
        const failed = () => {
          if (generation !== previewGeneration) return;
          status.textContent = "Preview couldn't be loaded. Use Open externally.";
        };

        let element;
        if (classification.kind === 'image') {
          element = document.createElement('img');
          element.alt = (link && (link.title || link.domain)) || 'Linked image';
          element.setAttribute('referrerpolicy', 'no-referrer');
          element.className = 'max-w-full max-h-full object-contain p-3';
          element.onload = () => loaded(element);
          element.onerror = failed;
        } else if (classification.kind === 'pdf') {
          element = document.createElement('iframe');
          element.title = (link && (link.title || link.domain)) || 'PDF preview';
          element.setAttribute('sandbox', sameOrigin ? 'allow-scripts' : 'allow-scripts allow-same-origin');
          element.setAttribute('referrerpolicy', 'no-referrer');
          element.className = 'w-full h-full border-0 bg-white';
          element.onload = () => loaded(element);
          element.onerror = failed;
        } else if (classification.kind === 'video' || classification.kind === 'audio') {
          element = document.createElement(classification.kind);
          element.controls = true;
          element.setAttribute('playsinline', '');
          if (classification.kind === 'video') element.playsInline = true;
          element.className = classification.kind === 'video' ? 'max-w-full max-h-full' : 'w-full max-w-xl p-4';
          element.addEventListener('loadeddata', () => loaded(element), { once: true });
          element.addEventListener('canplay', () => loaded(element), { once: true });
          element.addEventListener('error', failed, { once: true });
        } else if (classification.kind === 'video-embed') {
          element = document.createElement('iframe');
          element.title = (link && (link.title || link.domain)) || 'Video preview';
          element.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
          element.setAttribute('allow', 'fullscreen; picture-in-picture');
          element.setAttribute('allowfullscreen', '');
          element.setAttribute('referrerpolicy', 'no-referrer');
          element.className = 'w-full h-full border-0 bg-black';
          element.onload = () => loaded(element);
          element.onerror = failed;
        } else {
          element = document.createElement('iframe');
          element.title = (link && (link.title || link.domain)) || 'Website preview';
          element.setAttribute('sandbox', sameOrigin
            ? 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox'
            : 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
          element.setAttribute('referrerpolicy', 'no-referrer');
          element.className = 'w-full h-full border-0 bg-white';
          element.onload = () => loaded(element);
          element.onerror = failed;
        }

        element.hidden = true;
        stage.append(element);
        element.src = classification.src;
        document.getElementById('file-preview-close').focus();
      }

      function openAttachmentPreview(attachmentId) {
        const attachment = (editorDraft && editorDraft.attachments || []).find(a => a.id === attachmentId);
        if (!attachment) return;
        const blob = attachment.blob || attachment.fileBlob;
        if (!(blob instanceof Blob)) { showToast('This older attachment has no saved file data. Please attach the file again.'); return; }

        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        const extension = (attachment.name.split('.').pop() || '').toLowerCase();
        const mime = attachment.mimeType || blob.type || 'application/octet-stream';
        const isPdf = mime === 'application/pdf' || attachment.type === 'PDF' || extension === 'pdf';
        const previewBlob = isPdf && blob.type !== 'application/pdf'
          ? new Blob([blob], { type: 'application/pdf' })
          : blob;
        previewObjectUrl = URL.createObjectURL(previewBlob);
        const objectUrl = previewObjectUrl;
        const generation = ++previewGeneration;

        previewReturnFocus = document.activeElement;
        document.getElementById('file-preview-title').textContent = attachment.name;
        const download = document.getElementById('file-preview-download');
        download.href = objectUrl;
        download.download = attachment.name;
        download.classList.remove('hidden');
        const external = document.getElementById('file-preview-external');
        external.classList.remove('hidden');
        external.target = '_blank';
        external.rel = 'noopener noreferrer';
        external.href = objectUrl;

        const body = document.getElementById('file-preview-body');
        body.replaceChildren();

        if (isPdf) {
          // Keep the browser's native PDF viewer in an unsandboxed iframe.
          // Sandboxing this frame disables the built-in PDF renderer in some browsers.
          const frame = document.createElement('iframe');
          frame.title = attachment.name;
          frame.src = objectUrl;
          frame.referrerPolicy = 'no-referrer';
          frame.className = 'w-full h-full border-0 bg-white';
          body.append(frame);
        } else if (mime.startsWith('image/')) {
          const image = document.createElement('img');
          image.src = objectUrl;
          image.alt = attachment.name;
          image.className = 'max-w-full max-h-full object-contain p-3';
          body.append(image);
        } else if (mime === 'text/html' || ['html', 'htm'].includes(extension)) {
          const frame = document.createElement('iframe');
          frame.title = attachment.name;
          frame.src = objectUrl;
          frame.setAttribute('sandbox', '');
          frame.referrerPolicy = 'no-referrer';
          frame.className = 'w-full h-full border-0 bg-white';
          body.append(frame);
        } else if (mime.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'js', 'css'].includes(extension)) {
          blob.text().then(text => {
            if (generation !== previewGeneration || previewObjectUrl !== objectUrl) return;
            const pre = document.createElement('pre');
            pre.className = 'w-full h-full overflow-auto p-4 text-xs whitespace-pre-wrap break-words text-main';
            pre.textContent = text;
            body.replaceChildren(pre);
          });
        } else if (mime.startsWith('audio/')) {
          const player = document.createElement('audio');
          player.controls = true;
          player.className = 'w-full max-w-xl p-4';
          player.src = objectUrl;
          body.append(player);
        } else if (mime.startsWith('video/')) {
          const player = document.createElement('video');
          player.controls = true;
          player.playsInline = true;
          player.className = 'max-w-full max-h-full';
          player.src = objectUrl;
          body.append(player);
        } else {
          const fallback = document.createElement('div');
          fallback.className = 'p-8 text-center max-w-md';
          const heading = document.createElement('div');
          heading.className = 'text-sm font-medium';
          heading.textContent = 'Preview isn’t available for this file type.';
          const detail = document.createElement('div');
          detail.className = 'text-xs text-muted mt-2';
          detail.textContent = 'Download the file or open it in another application.';
          fallback.append(heading, detail);
          body.append(fallback);
        }

        document.getElementById('file-preview-overlay').classList.remove('hidden');
        document.getElementById('file-preview-close').focus();
        refreshIcons();
      }
      function closeAttachmentPreview() {
        previewGeneration++;
        document.getElementById('file-preview-overlay').classList.add('hidden');
        document.getElementById('file-preview-body').replaceChildren();
        document.getElementById('file-preview-download').classList.remove('hidden');
        if (previewReturnFocus && previewReturnFocus.focus) previewReturnFocus.focus();
        previewReturnFocus = null;
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }

      function renderEditorMoreMenu() {
        renderSwatches('editor-colour-swatches', editorDraft.colour, colourId => {
          editorDraft.colour = colourId;
          applyEditorVisuals();
          renderEditorMoreMenu();
          scheduleAutoSave();
        });

        document.getElementById('more-pin-label').textContent = editorDraft.pinned ? 'Unpin note' : 'Pin note';
        document.getElementById('more-format-state').textContent = formattingBarOpen ? 'On' : 'Off';
        document.getElementById('more-archive-label').textContent = editorDraft.archived ? 'Restore from Archive' : 'Archive';
        document.getElementById('more-delete-label').textContent = editorDraft.trashed ? 'Restore from Trash' : 'Delete';

        const folderSel = document.getElementById('editor-folder-select');
        folderSel.innerHTML = `<option value="">Unfiled</option>` +
          state.folders.map(f => `<option value="${f.id}" ${editorDraft.folderId === f.id ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');

        const labelsWrap = document.getElementById('editor-labels-checklist');
        labelsWrap.innerHTML = state.labels.map(l => {
          const active = (editorDraft.labelIds || []).includes(l.id);
          return `
            <button type="button" data-toggle-label="${l.id}" class="px-2 py-0.5 rounded-full text-[11px] border transition-colors" style="background:${active ? (state.theme === 'dark' ? labelColour(l).dark : labelColour(l).light) : 'transparent'};border-color:${active ? labelColour(l).swatch : 'var(--border-muted)'};color:var(--text-main);">
              #${escapeHtml(l.name)}
            </button>
          `;
        }).join('');

        labelsWrap.querySelectorAll('[data-toggle-label]').forEach(btn => {
          btn.addEventListener('click', () => {
            const lid = btn.getAttribute('data-toggle-label');
            editorDraft.labelIds = MemoryNoteEditor.toggleLabel(editorDraft.labelIds, lid);
            applyEditorVisuals();
            renderEditorMoreMenu();
            scheduleAutoSave();
          });
        });
      }

      // --- CONFIRMATION MODAL ---
      let activeConfirmCallback = null;

      function openConfirm({ title, message, extraHtml, destructive, onOpen, onConfirm }) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        const extraEl = document.getElementById('confirm-extra');
        if (extraHtml) {
          extraEl.innerHTML = extraHtml;
          extraEl.classList.remove('hidden');
        } else {
          extraEl.innerHTML = '';
          extraEl.classList.add('hidden');
        }

        const okBtn = document.getElementById('confirm-ok-btn');
        if (destructive) {
          okBtn.style.backgroundColor = 'var(--accent-clay)';
        } else {
          okBtn.style.backgroundColor = '';
        }

        activeConfirmCallback = onConfirm;
        confirmReturnFocus = document.activeElement;
        document.getElementById('confirm-overlay').classList.remove('hidden');
        if (typeof onOpen === 'function') onOpen();
        document.getElementById('confirm-cancel-btn').focus();
      }

      function closeConfirm() {
        activeConfirmCallback = null;
        document.getElementById('confirm-overlay').classList.add('hidden');
        if (confirmReturnFocus && confirmReturnFocus.focus) confirmReturnFocus.focus();
        confirmReturnFocus = null;
      }

      function toggleTheme() {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        saveState();
        applyTheme();
        if (currentView === 'settings') renderMain();
      }

      function renderAll() {
        renderNav();
        renderMain();
        renderBulkToolbar();
        applyReadOnlyMode();
        refreshIcons();
      }

      // --- STATIC EVENT LISTENERS ---
      document.getElementById('open-drawer-btn').addEventListener('click', openMobileDrawer);
      document.getElementById('close-drawer-btn').addEventListener('click', closeMobileDrawer);
      document.getElementById('mobile-drawer-backdrop').addEventListener('click', closeMobileDrawer);
      document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
      document.getElementById('auth-gate-google-btn').addEventListener('click', handleGoogleAccountAction);
      document.querySelectorAll('[data-sync-trigger]').forEach(button => button.addEventListener('click', () => syncCloudNotes()));

      const searchInput = document.getElementById('search-input');
      const clearSearchBtn = document.getElementById('clear-search-btn');
      let searchDebounceTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        clearSearchBtn.classList.toggle('hidden', !searchInput.value);
        if (selectionMode) exitSelectionMode();
        const query = searchInput.value;
        searchDebounceTimer = setTimeout(() => {
          searchQuery = query;
          renderMain();
          refreshIcons();
        }, 90);
      });
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearTimeout(searchDebounceTimer);
        searchQuery = '';
        clearSearchBtn.classList.add('hidden');
        renderMain();
        refreshIcons();
      });

      document.getElementById('bulk-exit-btn').addEventListener('click', () => {
        exitSelectionMode();
        renderAll();
      });

      // Editor events
      document.getElementById('editor-title').addEventListener('input', e => {
        document.getElementById('editor-dialog-title').textContent = e.target.value.trim() || 'Untitled note';
        scheduleAutoSave();
      });
      document.getElementById('editor-body').addEventListener('input', scheduleAutoSave);
      document.getElementById('editor-done-btn').addEventListener('click', closeEditor);
      document.getElementById('editor-overlay').addEventListener('click', e => {
        if (e.target.id === 'editor-overlay') closeEditor();
      });

      document.getElementById('editor-attach-btn').addEventListener('click', () => {
        document.getElementById('attachment-file-input').click();
      });
      document.getElementById('attachment-file-input').addEventListener('change', e => {
        const files = Array.from(e.target.files || []);
        if (!files.length || !editorDraft) return;
        const accepted = [];
        let rejectedCount = 0;
        for (const file of files) {
          const validation = MemoryAttachmentPolicy.validateFile(file);
          if (!validation.valid) rejectedCount++;
          else accepted.push(file);
        }
        if (rejectedCount) {
          showToast(rejectedCount + ' file(s) exceed the ' + MemoryAttachmentPolicy.MAX_FILE_LABEL + ' per-file limit and were not attached.');
        }
        e.target.value = '';
        if (!accepted.length) return;
        editorDraft.attachments = editorDraft.attachments || [];
        accepted.forEach(file => {
          const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();
          editorDraft.attachments.push({
            id: uid('a'), name: file.name, type: ext, size: formatFileSize(file.size),
            sizeBytes: file.size, mimeType: file.type || 'application/octet-stream', blob: file
          });
        });
        renderEditorAttachments();
        scheduleAutoSave();
      });

      document.getElementById('editor-link-btn').addEventListener('click', () => {
        const bar = document.getElementById('add-link-bar');
        bar.classList.toggle('hidden');
        if (!bar.classList.contains('hidden')) {
          document.getElementById('link-url-input').focus();
        }
      });
      document.getElementById('cancel-link-btn').addEventListener('click', () => {
        document.getElementById('add-link-bar').classList.add('hidden');
      });
      document.getElementById('save-link-btn').addEventListener('click', async () => {
        const urlInput = document.getElementById('link-url-input');
        const titleInput = document.getElementById('link-title-input');
        let rawUrl = urlInput.value.trim();
        if (!rawUrl || !editorDraft) return;
        if (!/^https?:\/\//i.test(rawUrl)) rawUrl = 'https://' + rawUrl;
        let parsedUrl;
        try { parsedUrl = new URL(rawUrl); if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported URL'); }
        catch (_) { showToast('Enter a valid website URL'); return; }
        const domain = extractDomain(rawUrl);
        const manualTitle = titleInput.value.trim();
        const link = { id: uid('lk'), title: manualTitle || domain, url: rawUrl, domain, titleLocked: Boolean(manualTitle), metadataPending: !manualTitle };
        editorDraft.links = editorDraft.links || [];
        editorDraft.links.push(link);
        urlInput.value = ''; titleInput.value = '';
        document.getElementById('add-link-bar').classList.add('hidden');
        renderEditorLinks(); scheduleAutoSave();
        if (!manualTitle) fetchLinkMetadata(editorDraft.id, link.id, rawUrl);
      });

      document.getElementById('editor-more-btn').addEventListener('click', e => {
        e.stopPropagation();
        const menu = document.getElementById('editor-more-menu');
        const willOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        e.currentTarget.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
          renderEditorMoreMenu();
          const firstAction = menu.querySelector('button, select');
          if (firstAction) firstAction.focus();
        } else e.currentTarget.focus();
      });

      document.addEventListener('click', e => {
        const menu = document.getElementById('editor-more-menu');
        if (!menu.classList.contains('hidden') && !e.target.closest('#editor-more-menu') && !e.target.closest('#editor-more-btn')) {
          menu.classList.add('hidden');
          document.getElementById('editor-more-btn').setAttribute('aria-expanded', 'false');
        }
      });

      document.getElementById('more-pin-btn').addEventListener('click', () => {
        if (!editorDraft) return;
        editorDraft.pinned = !editorDraft.pinned;
        applyEditorVisuals();
        renderEditorMoreMenu();
        scheduleAutoSave();
      });

      document.getElementById('more-format-btn').addEventListener('click', () => {
        formattingBarOpen = !formattingBarOpen;
        document.getElementById('formatting-bar').classList.toggle('hidden', !formattingBarOpen);
        document.getElementById('more-format-state').textContent = formattingBarOpen ? 'On' : 'Off';
        document.getElementById('editor-more-menu').classList.add('hidden');
        document.getElementById('editor-more-btn').setAttribute('aria-expanded', 'false');
        document.getElementById('editor-body').focus();
      });

      document.getElementById('editor-body').addEventListener('paste', event => {
        const clipboardHtml = event.clipboardData && event.clipboardData.getData('text/html');
        if (!clipboardHtml) return;
        event.preventDefault();
        document.execCommand('insertHTML', false, sanitizeNoteHtml(clipboardHtml));
        scheduleAutoSave();
      });

      document.querySelectorAll('.fmt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const cmd = btn.getAttribute('data-fmt');
          document.getElementById('editor-body').focus();
          document.execCommand(cmd, false, null);
          btn.setAttribute('aria-pressed', String(document.queryCommandState(cmd)));
          scheduleAutoSave();
        });
      });

      document.getElementById('add-checklist-item-btn').addEventListener('click', addChecklistItem);
      document.getElementById('inline-add-check-btn').addEventListener('click', addChecklistItem);

      document.getElementById('editor-folder-select').addEventListener('change', e => {
        if (!editorDraft) return;
        editorDraft.folderId = e.target.value;
        applyEditorVisuals();
        scheduleAutoSave();
      });

      document.getElementById('more-duplicate-btn').addEventListener('click', () => {
        if (!editorDraft || isDraftEmpty()) return;
        persistEditorDraft();
        const maxOrder = state.notes.reduce((m, n) => Math.max(m, n.order || 0), 0);
        const copy = cloneData(editorDraft);
        copy.id = uid('n');
        copy.title = copy.title ? copy.title + ' (copy)' : '';
        copy.order = maxOrder + 1;
        copy.createdAt = Date.now();
        copy.folderId = '';
        copy.pinned = false;
        copy.archived = false;
        copy.trashed = false;
        copy.checklist = (copy.checklist || []).map(item => ({ ...item, id: uid('c') }));
        copy.attachments = (copy.attachments || []).map(att => ({ ...att, id: uid('a') }));
        copy.links = (copy.links || []).map(link => ({ ...link, id: uid('lk') }));
        state.notes.push(copy);
        saveState();
        document.getElementById('editor-more-menu').classList.add('hidden');
        renderAll();
        showToast('Note duplicated');
      });

      document.getElementById('more-archive-btn').addEventListener('click', () => {
        if (!editorDraft) return;
        editorDraft.archived = !editorDraft.archived;
        if (editorDraft.archived) editorDraft.trashed = false;
        persistEditorDraft();
        const wasArchived = editorDraft.archived;
        closeEditor();
        showToast(wasArchived ? 'Note archived' : 'Note restored to Home');
      });

      document.getElementById('more-delete-btn').addEventListener('click', () => {
        if (!editorDraft) return;
        if (editorDraft.trashed) {
          editorDraft.trashed = false;
          if (editorDraft.folderId && !state.folders.some(f => f.id === editorDraft.folderId)) editorDraft.folderId = '';
          persistEditorDraft(); closeEditor(); showToast('Note restored');
        } else {
          editorDraft.title = document.getElementById('editor-title').value;
          editorDraft.bodyHtml = captureEditorBodyHtml();
          const noteTitle = editorDraft.title.trim() || 'Untitled note';
          openConfirm({
            title: 'Move note to Trash?',
            message: `“${noteTitle}” will move to Trash. You can restore it later.`,
            destructive: true,
            onConfirm: () => {
              if (!editorDraft) return;
              editorDraft.trashed = true; editorDraft.archived = false;
              persistEditorDraft(); closeEditor(); showToast('Moved to Trash');
            }
          });
        }
      });

      // Confirm modal buttons
      document.getElementById('confirm-cancel-btn').addEventListener('click', closeConfirm);
      document.getElementById('confirm-overlay').addEventListener('click', e => {
        if (e.target.id === 'confirm-overlay') closeConfirm();
      });
      document.getElementById('confirm-ok-btn').addEventListener('click', () => {
        const cb = activeConfirmCallback;
        closeConfirm();
        if (typeof cb === 'function') cb();
      });

      // Attachment preview controls.
      document.getElementById('file-preview-close').addEventListener('click', closeAttachmentPreview);
      document.getElementById('file-preview-overlay').addEventListener('click', e => { if (e.target.id === 'file-preview-overlay') closeAttachmentPreview(); });

      // Reconnect restores availability but never starts a cloud sync automatically.
      window.addEventListener('online',()=>{retryPendingLinkMetadata();applyReadOnlyMode();});
      window.addEventListener('offline',()=>{applyReadOnlyMode();if(currentView==='settings')renderMain();});

      // PWA install prompt (Chrome/Edge); iOS users can use Share > Add to Home Screen.
      window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault(); installPromptEvent = event;
        if (currentView === 'settings') renderMain();
      });
      window.addEventListener('appinstalled', () => { installPromptEvent = null; showToast('Memory installed'); });
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed:', error)));
      }

      // Escape key closes modals or selection mode.
      document.addEventListener('keydown', e => {
        const visible = id => !document.getElementById(id).classList.contains('hidden');
        const drawerOpen = document.getElementById('mobile-drawer').getAttribute('aria-hidden') === 'false';
        const activeModal = visible('file-preview-overlay') ? document.querySelector('#file-preview-overlay [role="dialog"]')
          : visible('confirm-overlay') ? document.querySelector('#confirm-overlay [role="alertdialog"]')
          : visible('editor-overlay') ? document.getElementById('editor-panel')
          : drawerOpen ? document.getElementById('mobile-drawer') : null;
        if (e.key === 'Escape') {
          if (visible('file-preview-overlay')) closeAttachmentPreview();
          else if (visible('confirm-overlay')) closeConfirm();
          else if (visible('editor-overlay') && !document.getElementById('editor-more-menu').classList.contains('hidden')) {
            document.getElementById('editor-more-menu').classList.add('hidden');
            document.getElementById('editor-more-btn').setAttribute('aria-expanded', 'false');
            document.getElementById('editor-more-btn').focus();
          }
          else if (visible('editor-overlay')) closeEditor();
          else if (drawerOpen) closeMobileDrawer();
          else if (selectionMode) { exitSelectionMode(); renderAll(); }
          return;
        }
        if (e.key === 'Tab' && activeModal) {
          const items = Array.from(activeModal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'))
            .filter(el => el.getClientRects().length && el.getAttribute('aria-hidden') !== 'true');
          if (!items.length) { e.preventDefault(); activeModal.focus(); return; }
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || !activeModal.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
        }
      });

      // Remove the old signed-out workspace. Google sign-in is now required.
      initializeStorage().then(async () => {
        try {
          await deleteDatabaseState('primary');
          try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
          try { localStorage.removeItem('memory_app_prototype_v6'); } catch (_) {}
        } catch (e) {
          console.error('Could not remove the old signed-out workspace:', e);
        }
        updateAuthGate();
        await initializeSupabaseAuth();
        if (authUser) {
          applyTheme();
          renderAll();
          retryPendingLinkMetadata();
        }
        if (currentView === 'settings' && authUser) renderMain();
      }).catch(error => {
        console.error('Memory startup failed:', error);
        authReady = true; syncStatus = 'error'; updateAuthGate();
      });
    })();
