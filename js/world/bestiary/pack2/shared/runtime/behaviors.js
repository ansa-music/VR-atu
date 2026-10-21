/** Lightweight local fauna AI, no navmesh allocations or global timers.
 * Use `behavior.update(dt, playerPosition)` from the world update loop.
 * Keep attack logic in your combat ECS, this is non-hostile wildlife only.
 */
export function createFaunaBehavior(THREE, root, def, opts={}) {
  const action=def.role;
  const origin = root.position.clone();
  const seed = [...def.id].reduce((n,c)=>n*31+c.charCodeAt(0),0)>>>0;
  const p = {time:(seed%99)*.03, dir:(seed%628)*.01, frightened:0};
  const maxWander=opts.maxWander ?? 5.5;
  const speed = action === 'убегает' ? 2.8 : action === 'летает' ? 1.6 : action === 'плавает' ? .70 : .28;
  const setAnim = n => {if(root.userData.animator.state.name!==n)root.userData.animator.setAnimation(n);};
  return {
    type:action,
    update(dt,playerPosition=null) {
      dt=Math.max(0,Math.min(.1,dt));p.time+=dt;
      let vx=Math.cos(p.dir),vz=Math.sin(p.dir);
      if(action==='убегает' && playerPosition){
        const dx=root.position.x-playerPosition.x,dz=root.position.z-playerPosition.z;
        if(dx*dx+dz*dz<25){p.frightened=3.2;p.dir=Math.atan2(dz,dx);vx=Math.cos(p.dir);vz=Math.sin(p.dir);}
      }
      p.frightened=Math.max(0,p.frightened-dt);
      const graze=action==='пасётся' && Math.sin(p.time*.7)>.15;
      const pace=p.frightened>0?speed:graze?0:speed*.35;
      const dx=root.position.x-origin.x,dz=root.position.z-origin.z;
      if(dx*dx+dz*dz>maxWander*maxWander)p.dir=Math.atan2(-dz,-dx);
      root.position.x+=Math.cos(p.dir)*pace*dt;
      root.position.z+=Math.sin(p.dir)*pace*dt;
      if(action==='летает')root.position.y=1.85+Math.sin(p.time*2.4)*.35;
      else if(action==='плавает')root.position.y=-.2+Math.sin(p.time*2.4)*.09;
      else root.position.y=0;
      root.rotation.y=p.dir + Math.PI/2;
      setAnim(p.frightened>0?'run':graze?'idle':action==='летает'?'run':'walk');
      if(action==='пасётся' && root.children[0]) root.children[0].rotation.x=graze?.13:0;
      p.dir+=Math.sin(p.time*.43)*dt*.07;
    },reset(){root.position.copy(origin);p.frightened=0;}
  };
}
