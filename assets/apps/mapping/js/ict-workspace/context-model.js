export function currentContext(payload,now=Date.now()) {
  const run=payload?.engine,context=payload?.context;
  if(payload?.ok!==true||payload?.mode!=='market_context'||run?.status!=='COMPLETED'||
      run?.result?.engine!=='amyfx-gold-context-v1'||context?.version!=='amyfx-gold-context-v1'||context?.fresh!==true)return null;
  const completed=Date.parse(run.completed_at);
  const isM5=Boolean(context.source?.M5);
  const m=Number(context.source?.M5||context.source?.M1);
  const m15=Number(context.source?.M15),h1=Number(context.source?.H1);
  const maxAge=isM5?900:180;
  const maxCompletedAge=isM5?600000:150000;
  if(!Number.isFinite(completed)||now-completed< -90000||now-completed>maxCompletedAge)return null;
  if(![m,m15,h1].every(Number.isFinite)||!m||!m15||!h1)return null;
  if(now/1000-m < -90||now/1000-m>maxAge||now/1000-m15 < -90||now/1000-m15>2100||now/1000-h1 < -90||now/1000-h1>10800)return null;
  return context;
}
