// Lightning Background demo: the real wallpaper scene in a frame, loaded when the visitor asks for it.
// It pauses while scrolled out of view, and tells the page when it runs so phones can rest the stage.
export const DEMO_URL = '/work/lightning/demo/index.html';

function init(root) {
  const run = root.querySelector('.demo-run');
  let frame = null, onScreen = true;
  const heavy = on => dispatchEvent(new CustomEvent('ew-heavy', { detail: on }));
  const apply = () => {
    const lbg = frame && frame.contentWindow && frame.contentWindow.LBG;
    if (!lbg) return;
    if (onScreen) lbg.resume(); else lbg.pause();
    heavy(onScreen);
  };
  run.addEventListener('click', () => {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.src = DEMO_URL;
    frame.title = 'Lightning Background scene. Click inside the frame to strike.';
    frame.addEventListener('load', apply);
    root.appendChild(frame);
    root.classList.add('running');
    run.hidden = true;
    heavy(true);
  });
  new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; apply(); }, { threshold: 0.15 }).observe(root);
}

const root = typeof document !== 'undefined' ? document.getElementById('storm-demo') : null;
if (root) init(root);
