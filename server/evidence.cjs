'use strict';
const crypto=require('node:crypto');
function createEvidenceStore({now=()=>Date.now()}={}){
 const items=new Map();
 const purge=()=>{for(const [id,item]of items)if(now()-item.createdAt>3600000)items.delete(id);while(items.size>32)items.delete(items.keys().next().value);};
 return {add(value){purge();const id=crypto.randomUUID();items.set(id,{...value,createdAt:now()});purge();return id;},get(id){purge();return typeof id==='string'?items.get(id)||null:null;},clear(){items.clear();}};
}
module.exports={createEvidenceStore};
