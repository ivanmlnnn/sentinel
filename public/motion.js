const progress=document.getElementById('scrollProgress');
const tagline=document.querySelector('.hero h1 em');
const links=[...document.querySelectorAll('.main-nav .nav-item')];
const sections=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
const revealNodes=document.querySelectorAll('.reveal');
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if('IntersectionObserver' in window && !reducedMotion){
  const revealObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    });
  },{threshold:0,rootMargin:'0px 0px -8% 0px'});
  revealNodes.forEach(node=>revealObserver.observe(node));
  const sectionObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      links.forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='#'+entry.target.id));
    });
  },{rootMargin:'-28% 0px -58% 0px'});
  sections.forEach(section=>sectionObserver.observe(section));
}else revealNodes.forEach(node=>node.classList.add('visible'));

links.forEach(link=>{
  link.addEventListener('click',event=>{
    const target=document.querySelector(link.getAttribute('href'));
    if(!target)return;
    event.preventDefault();
    target.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});
    links.forEach(item=>item.classList.toggle('active',item===link));
    if(!reducedMotion){
      target.classList.remove('nav-arrival');
      requestAnimationFrame(()=>target.classList.add('nav-arrival'));
      window.setTimeout(()=>target.classList.remove('nav-arrival'),700);
    }
  });
});

function updateScrollEffects(){
  const max=document.documentElement.scrollHeight-window.innerHeight;
  if(progress)progress.style.width=(max>0?window.scrollY/max*100:0)+'%';
  if(tagline){
    const hero=document.querySelector('.hero');
    const travel=hero?Math.max(180,hero.offsetHeight*.7):260;
    const amount=Math.max(0,Math.min(1,window.scrollY/travel));
    tagline.style.setProperty('--tagline-progress',String(.12+amount*.88));
  }
}
window.addEventListener('scroll',updateScrollEffects,{passive:true});
window.addEventListener('resize',updateScrollEffects,{passive:true});
updateScrollEffects();


/* Wallet tracker gets a dedicated enter/leave state as it crosses the viewport. */
const trackerHeading=document.getElementById('investigate');
if(trackerHeading && 'IntersectionObserver' in window && !reducedMotion){
  const trackerObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      trackerHeading.classList.toggle('tracker-in-view',entry.isIntersecting);
    });
  },{threshold:0.35});
  trackerObserver.observe(trackerHeading);
}else if(trackerHeading){
  trackerHeading.classList.add('tracker-in-view');
}
