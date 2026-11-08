const progress=document.getElementById('scrollProgress');
const links=[...document.querySelectorAll('.main-nav .nav-item')];
const sections=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
const revealNodes=document.querySelectorAll('.reveal');
if('IntersectionObserver' in window){
 const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');revealObserver.unobserve(entry.target)}}),{threshold:.08,rootMargin:'0px 0px -35px 0px'});
 revealNodes.forEach(node=>revealObserver.observe(node));
 const sectionObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+entry.target.id))}}),{rootMargin:'-22% 0px -65% 0px'});
 sections.forEach(section=>sectionObserver.observe(section));
}else revealNodes.forEach(node=>node.classList.add('visible'));
function updateProgress(){const max=document.documentElement.scrollHeight-window.innerHeight;progress.style.width=(max>0?window.scrollY/max*100:0)+'%'}
window.addEventListener('scroll',updateProgress,{passive:true});updateProgress();