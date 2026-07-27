"use strict";
function normalizeText(v){return String(v||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim()}
function canonicalUrl(v){try{const u=new URL(v);u.search="";u.hash="";return u.toString().replace(/\/$/,"")}catch{return String(v||"").trim()}}
function eventIdFromUrl(v){return String(v||"").match(/detail-(PE\d+)/i)?.[1]?.toUpperCase()||""}
function isEventLanding({finalUrl}){return /\/benefits\/exhibitions\/detail-PE\d+/i.test(String(finalUrl||""))||/\/events?(?:\/|$)/i.test(String(finalUrl||""))}
function dateUtc(y,m,d){const v=new Date(Date.UTC(+y,+m-1,+d));return Number.isNaN(v.getTime())?null:v}
function parseDateRange(text,checkedAt=new Date()){const s=normalizeText(text);const f=s.match(/(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*(?:~|\uFF5E|-|to)\s*(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/i);if(f)return{startDate:dateUtc(f[1],f[2],f[3]),endDate:dateUtc(f[4],f[5],f[6]),evidence:f[0]};const q=s.match(/(\d{1,2})[.\-/]\s*(\d{1,2})\s*(?:~|\uFF5E|-|to)\s*(\d{1,2})[.\-/]\s*(\d{1,2})/i);if(!q)return null;const y=checkedAt.getUTCFullYear(),ey=+q[3]<+q[1]?y+1:y;return{startDate:dateUtc(y,q[1],q[2]),endDate:dateUtc(ey,q[3],q[4]),evidence:q[0]}}
function formatDate(d){return d?d.toISOString().slice(0,10):"NO_SCHEDULE"}
function classifySchedule(r,checkedAt=new Date(),thresholdDays=7){if(!r?.endDate)return{status:"NO_SCHEDULE",daysRemaining:null};const t=Date.UTC(checkedAt.getUTCFullYear(),checkedAt.getUTCMonth(),checkedAt.getUTCDate()),n=Math.ceil((r.endDate.getTime()-t)/86400000);return n<0?{status:"EXPIRED",daysRemaining:n}:n<=thresholdDays?{status:`D-${n}`,daysRemaining:n}:{status:"NORMAL",daysRemaining:n}}
module.exports={canonicalUrl,classifySchedule,eventIdFromUrl,formatDate,isEventLanding,normalizeText,parseDateRange};
