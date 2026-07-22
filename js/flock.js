class Flock {
	constructor(boids) {
		this.length = boids;
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
		this.organize();
		this.reset();
	}

	update() {
		if (this.length !== opt.boids) this.resize(opt.boids);

		for (const boid of this.boids) boid.update();

		if (opt.particle || opt.vision === 0)
			for (const boid of this.boids) boid.interact();
		else {
			this.organize();
			for (const boid of this.boids) {
				boid.flock(flock);
				boid.interact();
			}
		}
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

	resize(n) {
		this.length = n;

		if (this.boids.length > n) {
			while (this.boids.length > n) {
				this.boids.pop().destroy();
			}
		} else {
			for (let i = this.boids.length; i < n; i++) {
				this.boids.push(new Boid(i));
			}
		}
	}

	reset() {
		const l = this.length;
		this.resize(0);
		this.resize(l);
	}

	organize() {
		let s = opt.vision;
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

		// search around the vision area's world center, which may be offset
		// from the boid, with enough reach to cover the shape's corners
		let x = boid.x;
		let y = boid.y;
		let reach = 1;
		if (opt.visionShape !== 0 || opt.visionOffset !== 0) {
			const a = boid.vel.angle();
			const cx = visionCenterX();
			x += cx * Math.cos(a);
			y += cx * Math.sin(a);
			reach = Math.ceil(visionBound() / s);
		}

		const row = Math.floor(y / s);
		const col = Math.floor(x / s);

		for (let r = row - reach; r <= row + reach; r++)
			for (let c = col - reach; c <= col + reach; c++)
				this._b(r, c, cand);

		return cand;
	}
}
