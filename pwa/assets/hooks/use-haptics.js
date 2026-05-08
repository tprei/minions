export function tapHaptic() {
  navigator.vibrate?.(10);
}

export function successHaptic() {
  navigator.vibrate?.([10, 50, 10]);
}

export function errorHaptic() {
  navigator.vibrate?.([50, 100, 50]);
}
