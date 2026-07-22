class Flock {
	constructor() {
		this.boids = [];
		this.buckets = [];
		this.space = {
			shape: null,
			scale: null,
			gwidth: null,
			gheight: null,
			width: null,
			height: null
		};
		this.rebuild();
		this.organize();
	}

	update() {
		this.reconcile();

		for (const boid of this.boids) boid.update();

		if (opt.particle) {
			for (const boid of this.boids) boid.interact();
		} else {
			this.organize();
			for (const boid of this.boids) {
				if (boid.dead) continue;
				if (boid.sp.vision > 0) boid.flock(flock);
				boid.interact();
			}
			this.hunt();
		}
	}

	// kills, bites, and corpse removal; runs on the buckets organize() just
	// built, and splices at the end of the frame when nothing reads them
	hunt() {
		const anyHunt = opt.species.map(s => s.hunt.some(Boolean));

		for (const b of this.boids) {
			if (b.dead || b.eatTimer > 0 || !anyHunt[b.si]) continue;

			const hunt = b.sp.hunt;

			outer: for (const c of this.contactCells(b)) {
				for (const o of c) {
					if (o === b || !hunt[o.si]) continue;
					if (b.sqrDist(o) > 100) continue;

					if (o.dead) {
						// a bite: consume, knock the corpse away, and start
						// the eat cooldown
						if (o.health <= 0) continue;
						o.health -= o.sp.decay;

						o.vel.set(o.x - b.x, o.y - b.y);
						if (o.vel.sqrMag() === 0) o.vel.random(1);
						o.vel.setMag(3 * b.sp.maxSpeed + 4);

						b.eatTimer = b.sp.eatCooldown * 60;
						break outer;
					}

					// a live target dies only when touched from behind: the
					// hunter sits in the half-plane opposite the prey's heading
					const dot =
						(b.x - o.x) * o.vel.x + (b.y - o.y) * o.vel.y;
					if (dot < 0) {
						o.dead = true;
						o.health = 100;
						o.acc.zero();
						break outer;
					}
				}
			}
		}

		for (let i = this.boids.length - 1; i >= 0; i--) {
			const b = this.boids[i];
			if (b.dead && b.health <= 0) {
				b.destroy();
				this.boids.splice(i, 1);
			}
		}
	}

	// the 3x3 cells around the boid itself; candidates() recenters on the
	// vision area, which is wrong for body contact. The bucket scale's 25px
	// floor keeps this wider than the contact radius
	contactCells(boid) {
		const cells = [];
		const s = this.space.scale;
		const row = Math.floor(boid.y / s);
		const col = Math.floor(boid.x / s);

		for (let r = row - 1; r <= row + 1; r++)
			for (let c = col - 1; c <= col + 1; c++) this._b(r, c, cells);

		return cells;
	}

	draw() {
		if (!opt.hidden) {
			for (const boid of this.boids) {
				boid.show();
			}
		}

		if (opt.buckets) {
			this.space.shape.alpha = 0.3;
		} else this.space.shape.alpha = 0;
	}

	// matches the boid population to the per-species counts, adding or
	// removing only what changed; index shifts (species removal, imports)
	// force a full rebuild
	reconcile() {
		const ns = opt.species.length;
		const counts = new Array(ns).fill(0);

		for (const boid of this.boids) {
			if (boid.si >= ns) return this.rebuild();
			counts[boid.si]++;
		}

		for (let si = 0; si < ns; si++) {
			const want = opt.species[si].count;
			let have = counts[si];

			for (; have < want; have++) this.boids.push(new Boid(si));

			if (have > want) {
				for (let i = this.boids.length - 1; i >= 0 && have > want; i--) {
					if (this.boids[i].si === si) {
						this.boids[i].destroy();
						this.boids.splice(i, 1);
						have--;
					}
				}
			}
		}
	}

	rebuild() {
		while (this.boids.length) this.boids.pop().destroy();

		for (let si = 0; si < opt.species.length; si++) {
			for (let i = 0; i < opt.species[si].count; i++) {
				this.boids.push(new Boid(si));
			}
		}
	}

	reset() {
		this.rebuild();
	}

	organize() {
		// one shared grid sized for the biggest vision range, with a floor so
		// tiny visions don't explode the bucket count
		let s = 25;
		for (const sp of opt.species) s = max(s, sp.vision);

		if (
			this.space.scale !== s ||
			this.space.gwidth !== g.width ||
			this.space.gheight !== g.height
		) {
			this.space.scale = s;

			this.space.gwidth = g.width;
			this.space.gheight = g.height;
			this.space.width = Math.ceil(g.width / s) * s;
			this.space.height = Math.ceil(g.height / s) * s;
			const shape = (this.space.shape ??= new PIXI.Graphics());

			shape.clear();
			shape.lineStyle(0.5, 0xffffff);

			for (let row = 0; row < this.space.height; row += s) {
				for (let col = 0; col < this.space.width; col += s) {
					shape.drawRect(col, row, s, s);
				}
			}

			app.stage.addChild(shape);
		}

		this.buckets.fill(undefined);

		for (const boid of this.boids) {
			const row = Math.floor(boid.y / this.space.scale);
			const col = Math.floor(boid.x / this.space.scale);
			this.buckets[row] ??= [];
			this.buckets[row][col] ??= [];
			this.buckets[row][col].push(boid);
		}
	}

	_b(r, c, a) {
		if (this.buckets[r]?.[c]) a.push(this.buckets[r][c]);
	}

	// Returns a list of lists of boids, where each sublist contains the boids
	// in a cell near the boid's vision area
	candidates(boid) {
		const cand = [];
		const s = this.space.scale;
		const sp = boid.sp;

		// search around the vision area's world center, which may be offset
		// from the boid, with enough reach to cover the shape's corners
		let x = boid.x;
		let y = boid.y;
		let reach = 1;
		if (sp.visionShape !== 0 || sp.visionOffset !== 0) {
			const a = boid.vel.angle();
			const cx = visionCenterX(sp);
			x += cx * Math.cos(a);
			y += cx * Math.sin(a);
			reach = Math.ceil(visionBound(sp) / s);
		}

		const row = Math.floor(y / s);
		const col = Math.floor(x / s);

		for (let r = row - reach; r <= row + reach; r++)
			for (let c = col - reach; c <= col + reach; c++)
				this._b(r, c, cand);

		return cand;
	}
}
