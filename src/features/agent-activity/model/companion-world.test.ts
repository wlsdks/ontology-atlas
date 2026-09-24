import {expect,it} from 'vitest';
import {moveInWorld,nearbyWorldSpot,worldWalkable,WORLD_SPOTS} from './companion-world';
it('keeps movement inside the world, slides along furniture and exposes reachable interactions',()=>{
 expect(moveInWorld({x:460,y:535},10000,10000)).toEqual({x:945,y:600});
 expect(moveInWorld({x:460,y:450},-200,-100)).toEqual({x:260,y:450});
 expect(worldWalkable({x:150,y:350})).toBe(false);expect(worldWalkable({x:150,y:500},true)).toBe(true);
 for(const spot of WORLD_SPOTS){expect(worldWalkable(spot.point)).toBe(true);expect(nearbyWorldSpot(spot.point)).toBe(spot.id);}
});
