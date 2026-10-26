'use strict';

// Small, strict pointer stored in the profile index. The immutable migration
// manifest supplies the storage identity; it is never inferred from a browser's
// current reset/generation fence after restoration.
const SHA=/^[a-f0-9]{64}$/;
const MIGRATION=/^lr-migration-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PROFILE=/^(?:legacy|p-[A-Za-z0-9-]{8,80})$/;
const FIELDS=['schemaVersion','protocol','scopeId','migrationId','manifestPath','manifestSha256','recordCount','adoptedAt'];
function plain(value){return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));}
function descriptor(value,profileId){
 if(!PROFILE.test(profileId)||!plain(value)||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!FIELDS.includes(key)||Object.getOwnPropertyDescriptor(value,key).get||Object.getOwnPropertyDescriptor(value,key).set))throw Error('Invalid records archive descriptor');
 if(value.schemaVersion!==1||value.protocol!==1||!SHA.test(value.scopeId||'')||!MIGRATION.test(value.migrationId||'')||!SHA.test(value.manifestSha256||'')||!Number.isSafeInteger(value.recordCount)||value.recordCount<0||value.recordCount>1000000000)throw Error('Invalid records archive descriptor values');
 if(value.manifestPath!=='profiles/'+profileId+'/record-archives/'+value.migrationId+'/manifest.json')throw Error('Records archive manifest path is not bound to its profile and migration');
 if(typeof value.adoptedAt!=='string'||!Number.isFinite(Date.parse(value.adoptedAt))||new Date(value.adoptedAt).toISOString()!==value.adoptedAt)throw Error('Invalid records archive adoption time');
 return JSON.parse(JSON.stringify(value));
}
function acknowledged(value,current){
 return plain(value)&&Reflect.ownKeys(value).length===2&&value.protocol===1&&value.scopeId===current.scopeId;
}
module.exports={descriptor,acknowledged,SHA,MIGRATION,PROFILE};
