class Boid extends V2D {
	constructor(si) {
		super(random(g.width), random(g.height));

		this.si = si;

		this.vel = V2D.random(random(this.sp.minSpeed, this.sp.maxSpeed));
		this.acc = new V2D();

		this.stamina = this.sp.maxStamina;
		this.exhausted = false;

		this.dead = false;
		this.health = 100; // decay remaining while dead, 100 → 0
		this.eatTimer = 0; // eat cooldown left, in frame units; > 0 = eating

		this.shape = new PIXI.Graphics();
		this.border = new PIXI.Graphics();
		this.area = new PIXI.Graphics();
		this.shapeMode = null;

		this.desired = new PIXI.Graphics();
		this.desired.clear();
		this.desired.beginFill();
		this.desired.lineStyle(2, hsv(0.9, 5, 1));
		this.desired.moveTo(0, 0);
		this.desired.lineTo(24, 0);
		this.desired.endFill();
		this.desired.alpha = 0;

		app.stage.addChild(this.area);
		app.stage.addChild(this.shape);
		app.stage.addChild(this.border);
		app.stage.addChild(this.desired);
	}

	// looked up live so imports/resets that replace opt.species can't leave
	// boids pointing at stale settings objects
	get sp() {
		return opt.species[this.si];
	}

	neighbors(flock) {
		const sp = this.sp;
		const cands = flock.candidates(this);
		const ns = [];
		const ds = [];

		const follow = sp.follow;
		const avoid = sp.avoid;
		const hunt = sp.hunt;

		const simple = sp.visionShape === 0 && sp.visionOffset === 0;
		const sqVis = sp.vision * sp.vision;
		let cos, sin;
		if (!simple) {
			const a = this.vel.angle();
			cos = Math.cos(a);
			sin = Math.sin(a);
		}

		const candidate_count = cands
			.map(c => c.length)
			.reduce((a, b) => a + b, 0);
		let step =
			opt.accuracy === 0 ? 1 : Math.ceil(candidate_count / opt.accuracy);
		let i = Math.floor(random(step));

		for (const c of cands) {
			for (; i < c.length; i += step) {
				if (this === c[i]) continue;
				// hunted species only become visible as corpses; chasing live
				// prey is still the follow relation's job
				if (
					!follow[c[i].si] &&
					!avoid[c[i].si] &&
					!(hunt[c[i].si] && c[i].dead)
				)
					continue;

				if (simple) {
					const d = this.sqrDist(c[i]);
					if (d < sqVis) {
						ns.push(c[i]);
						ds.push(d);
					}
				} else {
					const wx = c[i].x - this.x;
					const wy = c[i].y - this.y;
					// rotate into the boid's local frame (+x = heading)
					const rx = wx * cos + wy * sin;
					const ry = wy * cos - wx * sin;
					if (visionContains(rx, ry, sp)) {
						ns.push(c[i]);
						ds.push(wx * wx + wy * wy);
					}
				}
			}
			i -= c.length;
		}

		return [ns, ds];
	}

	flock(flock) {
		this.acc.zero();

		const sp = this.sp;
		const follow = sp.follow;
		const avoid = sp.avoid;
		const hunt = sp.hunt;

		const aln = new V2D();
		const csn = new V2D();
		const sep = new V2D();
		const flee = new V2D();

		let [ns, ds] = this.neighbors(flock);

		let nf = 0;
		let na = 0;
		let i = 0;
		let corpse = null;
		let corpseD = Infinity;
		for (const other of ns) {
			const d = 1 / (ds[i] || 0.00001);

			// remember the nearest edible corpse; if one is in sight it takes
			// priority over flocking below
			if (
				hunt[other.si] &&
				other.dead &&
				other.health > 0 &&
				ds[i] < corpseD
			) {
				corpse = other;
				corpseD = ds[i];
			}

			if (follow[other.si]) {
				// corpses are still gathered around (cohesion/separation) but
				// their drifting velocity is not worth aligning with
				if (!other.dead) {
					// alignment is the average of velocity * bias strength ^ dot
					const b = sp.bias ** other.vel.dot(this.vel);
					aln.sclAdd(other.vel, b);
				}

				// cohesion finds the average of positions
				csn.add(other);

				// separation is stronger for closer boids, so it's multiplied
				// by d
				sep.x += (this.x - other.x) * d;
				sep.y += (this.y - other.y) * d;

				nf++;
			}

			// avoided species are fled from like separation, but with their
			// own strength
			if (avoid[other.si]) {
				flee.x += (this.x - other.x) * d;
				flee.y += (this.y - other.y) * d;

				na++;
			}

			i++;
		}

		if (nf > 0) {
			aln.setMag(sp.maxSpeed).sub(this.vel).max(sp.maxForce);

			csn.div(nf)
				.sub(this)
				.setMag(sp.maxSpeed)
				.sub(this.vel)
				.max(sp.maxForce);

			sep.setMag(sp.maxSpeed).sub(this.vel).max(sp.maxForce);
		}

		if (na > 0) flee.setMag(sp.maxSpeed).sub(this.vel).max(sp.maxForce);

		// eating beats flocking: seek the corpse instead of following the
		// flock, keeping only the flee force so avoided species still repel.
		// The steer gets double the normal force cap so hunters turn onto a
		// corpse decisively even from a nearly opposite heading
		if (corpse) {
			const seek = V2D.sub(corpse, this)
				.setMag(sp.maxSpeed)
				.sub(this.vel)
				.max(2 * sp.maxForce);

			this.acc.sclAdd(seek, 2);
			this.acc.sclAdd(flee, sp.avoidForce);
			return;
		}

		this.acc.sclAdd(aln, sp.alignment);
		this.acc.sclAdd(csn, sp.cohesion);
		this.acc.sclAdd(sep, sp.separation);
		this.acc.sclAdd(flee, sp.avoidForce);
	}

	interact() {
		if (opt.particle || this.sp.vision === 0) {
			this.acc.zero();
		}

		if (g.mouse.down && g.mouse.over) {
			const mv = new V2D(g.mouse.x, g.mouse.y);

			const d = mv.sqrDist(this);

			mv.sub(this)
				.setMag(10000 / (d || 1))
				.max(g.mouseForce);

			if (g.mouse.button === 0) {
				this.acc.add(mv);
			} else if (g.mouse.button === 2) {
				this.acc.sub(mv);
			}
		}

		if (g.explode > 0.001) {
			const ev = g.explodePos.clone();

			const d = ev.sqrDist(this);

			ev.sub(this)
				.setMag((g.explode * 100000) / (d || 1))
				.max(g.mouseForce * 3);

			this.acc.sub(ev);
		}
	}

	update() {
		const sp = this.sp;

		if (this.dead) {
			// corpses only drift: no steering, noise, or speed clamps, so a
			// bite's knockback can exceed maxSpeed and bleed off through drag
			// (floored so it always decays); integration and edge handling
			// below stay shared
			this.vel.mult(1 - Math.max(sp.drag, 0.02));
		} else {
			if (opt.avoidEdges && opt.edgeMargin > 0) {
				const m = opt.edgeMargin;
				// linear ramp from 0 at the margin boundary; the peak is sized
				// so the ramp's work over the band is double what's needed to
				// stop a maxSpeed boid hitting the edge head-on
				const f = (2 * sp.maxSpeed * sp.maxSpeed) / (m * m);
				if (this.x < m) this.acc.x += (m - this.x) * f;
				else if (this.x > g.width - m)
					this.acc.x -= (this.x - (g.width - m)) * f;
				if (this.y < m) this.acc.y += (m - this.y) * f;
				else if (this.y > g.height - m)
					this.acc.y -= (this.y - (g.height - m)) * f;
			}

			this.vel.sclAdd(this.acc, g.delta);

			if (sp.drag) this.vel.mult(1 - sp.drag);

			if (sp.noise) {
				const r = (Math.PI / 80) * sp.noise;
				this.vel.rotate(random(-r, r));
			}

			if (sp.minSpeed) {
				if (this.vel.sqrMag() === 0) this.vel.random(sp.minSpeed);
				else this.vel.min(sp.minSpeed);
			}

			this.vel.max(sp.maxSpeed);

			// after the min clamp, so exhaustion wins even when minSpeed > 25%
			if (this.exhausted) this.vel.max(0.25 * sp.maxSpeed);

			if (sp.staminaDrain) {
				const ratio = sp.maxSpeed ? this.vel.mag() / sp.maxSpeed : 0;
				if (ratio > 0.5)
					this.stamina -=
						sp.staminaDrain * ((ratio - 0.5) / 0.5) * g.delta;
				else this.stamina += sp.staminaFill * g.delta;
				this.stamina = constrain(this.stamina, 0, sp.maxStamina);
				if (this.stamina <= 0 && !this.exhausted) {
					this.exhausted = true;
					this.vel.max(0.25 * sp.maxSpeed);
				} else if (this.stamina >= sp.maxStamina) this.exhausted = false;
			} else this.exhausted = false;

			// eating pins the eater at min speed until the cooldown runs out
			if (this.eatTimer > 0) {
				this.eatTimer -= g.delta;
				this.vel.max(sp.minSpeed);
			}
		}

		this.sclAdd(this.vel, g.delta);

		if (opt.bounce) {
			let ran = false;
			if (this.x < 0 || this.x > g.width) {
				ran = true;
				this.vel.x *= -1;
			}
			if (this.y < 0 || this.y > g.height) {
				ran = true;
				this.vel.y *= -1;
			}
			if (ran) {
				this.x = constrain(this.x, 0, g.width);
				this.y = constrain(this.y, 0, g.height);
			}
		} else {
			this.x = ((this.x % g.width) + g.width) % g.width;
			this.y = ((this.y % g.height) + g.height) % g.height;
		}
	}

	show() {
		const sp = this.sp;

		this.shape = this.getShape();
		this.shape.x = this.x;
		this.shape.y = this.y;
		// a corpse that has drifted to a stop keeps its last heading instead
		// of snapping to angle 0
		if (!this.dead || this.vel.sqrMag() > 0.01)
			this.shape.rotation = this.vel.angle();

		// the area gets the boid's position and heading but never its
		// squash-and-stretch scale, so it always shows the true vision shape
		this.area.x = this.x;
		this.area.y = this.y;
		this.area.rotation = this.shape.rotation;

		if (opt.stretch && !this.dead) {
			const t = constrain(this.vel.mag() / sp.maxSpeed, 0, 1);
			const w = 1.4 - 0.9 * t;
			this.shape.scale.y = w;
			this.shape.scale.x = 1 / w;
		} else {
			this.shape.scale.x = 1;
			this.shape.scale.y = 1;
		}

		// the border mirrors the body's transform but is never tinted, so it
		// keeps the exact species color even with hues on
		this.border.x = this.shape.x;
		this.border.y = this.shape.y;
		this.border.rotation = this.shape.rotation;
		this.border.scale.x = this.shape.scale.x;
		this.border.scale.y = this.shape.scale.y;

		if (this.dead) {
			// corpses darken and fade out as they get eaten
			this.shape.tint = 0x804040;
			this.shape.alpha = 0.15 + (0.65 * this.health) / 100;
			this.border.alpha = this.shape.alpha;
		} else {
			// getShape only sets alpha on rebuild, so undo any corpse fade
			this.shape.alpha = 0.8;
			this.border.alpha = 0.9;

			if (this.eatTimer > 0) this.shape.tint = 0xff9060;
			else if (opt.hues)
				this.shape.tint = hsv(
					constrain(this.vel.mag() / (sp.maxSpeed * 2), 0, 1),
					1,
					1
				);
			else this.shape.tint = 0xffffff;
		}

		if (opt.desired && this.acc.sqrMag() > 0.01) {
			this.desired.alpha = 0.5;
			this.desired.x = this.x;
			this.desired.y = this.y;
			this.desired.rotation = this.acc.angle();
		} else this.desired.alpha = 0;
	}

	getShape() {
		if (this.shapeMode !== g.shapeMode) {
			const sp = this.sp;

			this.shape.clear();
			this.border.clear();

			if (!opt.hideBoids) {
				this.shape.beginFill(0xffffff);
				this.shape.lineStyle();
				this.shape.moveTo(6, 0);
				this.shape.lineTo(-6, -4);
				this.shape.lineTo(-4, 0);
				this.shape.lineTo(-6, 4);
				this.shape.lineTo(6, 0);
				this.shape.endFill();

				this.border.lineStyle(1.5, sp.color);
				this.border.moveTo(6, 0);
				this.border.lineTo(-6, -4);
				this.border.lineTo(-4, 0);
				this.border.lineTo(-6, 4);
				this.border.lineTo(6, 0);
			}

			this.area.clear();
			if (opt.areas || opt.outlines) {
				const k = opt.halfAreas ? 0.5 : 1;
				const v = sp.vision * k;
				const cx = visionCenterX(sp) * k;

				this.area.beginFill(0xffffff, opt.areas ? 0.03 : 0);
				this.area.lineStyle(opt.outlines ? 0.5 : 0, 0xffffff, 0.2);
				switch (sp.visionShape) {
					case 1:
						this.area.drawRect(cx - v, -v, 2 * v, 2 * v);
						break;
					case 2:
						this.area.drawPolygon([cx + v, 0, cx - v, -v, cx - v, v]);
						break;
					case 3:
						this.area.drawPolygon([cx - v, 0, cx + v, -v, cx + v, v]);
						break;
					case 4: {
						const lo =
							((sp.visionArcDir - sp.visionArc / 2) * Math.PI) /
							180;
						const hi =
							((sp.visionArcDir + sp.visionArc / 2) * Math.PI) /
							180;

						const sector = (a, b) => {
							this.area.moveTo(cx, 0);
							this.area.arc(cx, 0, v, a, b);
							this.area.closePath();
						};

						// merge overlapping arcs into one path so the fill
						// doesn't double up or punch even-odd holes
						if (lo <= 0 && hi >= Math.PI) {
							this.area.drawCircle(cx, 0, v);
						} else if (lo <= 0) {
							sector(-hi, hi);
						} else if (hi >= Math.PI) {
							sector(lo, 2 * Math.PI - lo);
						} else {
							sector(lo, hi);
							sector(-hi, -lo);
						}
						break;
					}
					default:
						this.area.drawCircle(cx, 0, v);
				}
				this.area.endFill();
			}

			this.shape.alpha = 0.8;
			this.border.alpha = 0.9;
			this.area.alpha = 0.8;

			this.shapeMode = g.shapeMode;
		}

		return this.shape;
	}

	destroy() {
		this.shape.destroy();
		this.border.destroy();
		this.area.destroy();
		this.desired.destroy();
	}
}
