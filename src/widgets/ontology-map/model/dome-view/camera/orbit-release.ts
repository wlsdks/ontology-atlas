import type { DomeRuntime } from "../runtime";
import { clampDomePitch, decayOrbitVelocity, ORBIT_SNAP_ARRIVE_RAD, orbitSnapTauMs } from "./orbit";

type OrbitPose = Pick<DomeRuntime, "yaw" | "pitch" | "yawVel" | "pitchVel" | "yawSnap" | "yawTarget" | "pitchTarget">;

/** Past the pitch limit, spring back exponentially. */
function springPitchIntoRange(dome: OrbitPose, dtMs: number): void {
  const clamped = clampDomePitch(dome.pitch);
  if (clamped !== dome.pitch) {
    dome.pitch += (clamped - dome.pitch) * (1 - Math.exp(-dtMs / 120));
    if (Math.abs(clamped - dome.pitch) < 0.0005) dome.pitch = clamped;
    dome.pitchVel = 0;
  }
}

/**
 * One frame of the turn after the hand lets go, with no pose tween or drag in charge. Carries the release to a
 * meaningful landing, only when it aimed at a domain meridian (`yawSnap`); τ derives from the release velocity so
 * speed does not jump when the pointer lifts (`orbitSnapTauMs`). On arrival it clears its own target.
 * Without a landing the release velocity coasts under geometric decay.
 */
export function stepOrbitRelease(dome: OrbitPose, dtMs: number): void {
  if (dome.yawSnap !== null) {
    const delta = dome.yawSnap - dome.yaw;
    if (Math.abs(delta) < ORBIT_SNAP_ARRIVE_RAD) {
      dome.yaw = dome.yawSnap;
      dome.yawSnap = null;
      dome.yawVel = 0;
    } else {
      const tau = orbitSnapTauMs(delta, dome.yawVel);
      dome.yaw += delta * (1 - Math.exp(-dtMs / tau));
      // The velocity gauge must keep saying how fast it is turning right now, so decay continues
      // even outside the inertia branch: the disarm check reads it.
      dome.yawVel = decayOrbitVelocity(dome.yawVel, dtMs);
    }
    dome.pitch += dome.pitchVel * dtMs;
    dome.pitchVel = decayOrbitVelocity(dome.pitchVel, dtMs);
  } else {
    dome.yaw += dome.yawVel * dtMs;
    dome.pitch += dome.pitchVel * dtMs;
    dome.yawVel = decayOrbitVelocity(dome.yawVel, dtMs);
    dome.pitchVel = decayOrbitVelocity(dome.pitchVel, dtMs);
  }
  springPitchIntoRange(dome, dtMs);
  // Outside a drag the target always follows the current pose, so the next drag does not inherit a stale gap.
  dome.yawTarget = dome.yaw;
  dome.pitchTarget = dome.pitch;
}
