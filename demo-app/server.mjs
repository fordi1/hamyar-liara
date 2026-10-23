// Isolated fixture only: never import into the production app.
import express from 'express';
const mode=process.argv.find(a=>a.startsWith('--fixture='))?.split('=')[1]||'healthy';
if(!['healthy','500','slow','memory','missing-db','wrong-port'].includes(mode))throw Error('Unknown fixture');
const app=express();let occupied=false;
app.get('/',async(_req,res)=>{res.set('X-Demo-Fixture','true');if(mode==='500')return res.status(500).send('DEMO: internal error');if(mode==='missing-db')return res.status(500).send('DEMO: missing DATABASE_URL (no real DB is accessed)');if(mode==='slow')await new Promise(r=>setTimeout(r,1500));if(mode==='memory'){if(occupied)return res.status(429).send('DEMO: one request at a time');occupied=true;const buffer=Buffer.alloc(8*1024*1024);await new Promise(r=>setTimeout(r,500));buffer.fill(0);occupied=false;}res.send('DEMO ONLY: healthy fixture');});
const port=mode==='wrong-port'?4011:4010;app.listen(port,'127.0.0.1',()=>console.log(`Isolated demo fixture: ${mode}; loopback port ${port}. Stop with Ctrl+C; restart without --fixture to reset.`));
