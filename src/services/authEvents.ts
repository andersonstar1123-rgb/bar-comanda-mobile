type UnauthorizedListener = () => void;

let listener: UnauthorizedListener | null = null;

export function onUnauthorized(fn: UnauthorizedListener) {
  listener = fn;
}

export function notifyUnauthorized() {
  listener?.();
}