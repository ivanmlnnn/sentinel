const progress=document.getElementById('scrollProgress');
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

function updateProgress(){
  const max=document.documentElement.scrollHeight-window.innerHeight;
  if(progress)progress.style.width=(max>0?window.scrollY/max*100:0)+'%';
}
window.addEventListener('scroll',updateProgress,{passive:true});
updateProgress();


/* Reveal key copy as the reader moves through the page. */
const readingTargets = document.querySelectorAll([
  '.hero-sub',
  '.wallet-guide-head b',
  '.wallet-guide-grid strong',
  '.wallet-guide-grid p',
  '.metric span',
  '.metric b',
  '.metric small',
  '.section-heading h2',
  '.section-meta',
  '.panel-top',
  '.verdict strong',
  '.verdict small',
  '.decision-foot',
  '.table-head span',
  '.registry-numbers b',
  '.registry-numbers span',
  '.registry-panel > p',
  '.signal-line span',
  '.security-method-heading h2',
  '.security-method-heading p',
  '.security-step b',
  '.security-step p',
  '.security-step small',
  '.security-guardrails b',
  '.security-guardrails span',
  '.security-footnote',
  'footer span'
].join(','));

if(reducedMotion){
  readingTargets.forEach(node=>node.classList.add('scroll-copy-visible'));
}else if('IntersectionObserver' in window){
  const copyObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('scroll-copy-visible');
      copyObserver.unobserve(entry.target);
    });
  },{threshold:0,rootMargin:'0px 0px -7% 0px'});
  readingTargets.forEach(node=>{
    const siblings=[...node.parentElement.children].filter(item=>item.matches([
      '.hero-sub','.wallet-guide-head b','.wallet-guide-grid strong','.wallet-guide-grid p',
      '.metric span','.metric b','.metric small','.section-heading h2','.section-meta',
      '.panel-top','.verdict strong','.verdict small','.decision-foot','.table-head span',
      '.registry-numbers b','.registry-numbers span','.registry-panel > p','.signal-line span',
      '.security-method-heading h2','.security-method-heading p','.security-step b',
      '.security-step p','.security-step small','.security-guardrails b',
      '.security-guardrails span','.security-footnote','footer span'
    ].join(',')));
    const order=Math.max(0,siblings.indexOf(node));
    node.style.setProperty('--copy-delay',Math.min(order,4)*65+'ms');
    node.classList.add('scroll-copy');
    copyObserver.observe(node);
  });
}else{
  readingTargets.forEach(node=>node.classList.add('scroll-copy-visible'));
}
