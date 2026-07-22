const random = (() => {
	const size = 65535;
	const lookup = new Array(size);
	let i = -1;

	for (let i = 0; i < size; i++) {
		lookup[i] = Math.random();
	}

	return (a, b) => {
		const r = lookup[++i >= size ? (i = 0) : i];
		return b ? r * (b - a) + a : r * a;
	};
})();

function max(a, b) {
	if (a >= b) return a;
	return b;
}

function constrain(x, a, b) {
	if (x <= a) return a;
	if (x >= b) return b;
	return x;
}

// vision-area geometry, shared by the neighbor test (Boid.neighbors) and the
// drawn area (Boid.getShape); local frame: +x = heading, area centered at
// (visionCenterX(sp), 0); sp is a species settings object from opt.species

function visionCenterX(sp) {
	return sp.visionOffset * sp.vision;
}

// (rx, ry) must already be rotated into the boid's local frame
function visionContains(rx, ry, sp) {
	const v = sp.vision;
	const cx = visionCenterX(sp);

	switch (sp.visionShape) {
		case 1: // rectangle
			return Math.abs(rx - cx) < v && Math.abs(ry) < v;
		case 2: // triangle pointing forward
			return rx >= cx - v && Math.abs(ry) <= (cx + v - rx) / 2;
		case 3: // triangle pointing backward
			return rx <= cx + v && Math.abs(ry) <= (rx - (cx - v)) / 2;
		case 4: {
			// two field-of-view arcs mirrored across the heading axis
			const dx = rx - cx;
			if (dx * dx + ry * ry >= v * v) return false;
			// folding with |ry| tests both eyes at once; phi and the arc
			// center both live in [0, pi], so no angle wraparound is needed
			const phi = Math.atan2(Math.abs(ry), dx);
			const dir = (sp.visionArcDir * Math.PI) / 180;
			const half = (sp.visionArc * Math.PI) / 360;
			return Math.abs(phi - dir) <= half;
		}
		default: {
			const dx = rx - cx;
			return dx * dx + ry * ry < v * v;
		}
	}
}

// bounding radius measured from the area's center
function visionBound(sp) {
	return sp.visionShape === 0 || sp.visionShape === 4
		? sp.vision
		: sp.vision * Math.SQRT2;
}

function hsv(h, s, v) {
	let r, g, b, i, f, p, q, t;

	i = Math.floor(h * 6);
	f = h * 6 - i;
	p = v * (1 - s);
	q = v * (1 - f * s);
	t = v * (1 - (1 - f) * s);
	switch (i % 6) {
		case 0:
			((r = v), (g = t), (b = p));
			break;
		case 1:
			((r = q), (g = v), (b = p));
			break;
		case 2:
			((r = p), (g = v), (b = t));
			break;
		case 3:
			((r = p), (g = q), (b = v));
			break;
		case 4:
			((r = t), (g = p), (b = v));
			break;
		case 5:
			((r = v), (g = p), (b = q));
			break;
	}

	const R = Math.round(r * 255);
	const G = Math.round(g * 255);
	const B = Math.round(b * 255);
	return 0x010000 * R + 0x000100 * G + 0x000001 * B;
}
