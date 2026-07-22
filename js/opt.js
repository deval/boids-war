const select = (() => {
	const cached = new Map();
	return query => {
		if (cached.has(query)) return cached.get(query);
		const el = document.querySelector(query);
		cached.set(query, el);
		return el;
	};
})();

let toggleMenu, togglePause;

const opt = (() => {
	const defaults = {
		menu: true,
		paused: false,

		toggle: false,
		desired: false,
		hideBoids: false,
		hues: true,
		stretch: false,
		areas: false,
		outlines: false,
		halfAreas: false,

		particle: false,
		bounce: false,
		avoidEdges: false,
		edgeMargin: 50,
		accuracyPower: 5,
		accuracy: 32,

		debug: false,
		buckets: false
	};

	// per-species settings; species 0 starts from these, later species copy
	// the last species. follow/avoid are boolean lists indexed by species.
	const speciesDefaults = {
		count: 500,
		color: 0x2f86c9,
		avoidForce: 1.5,
		vision: 25,
		visionShape: 0,
		visionOffset: 0,
		visionArc: 120,
		visionArcDir: 0,
		alignment: 1.1,
		bias: 1.5,
		cohesion: 1,
		separation: 1.1,
		maxForce: 0.2,
		minSpeed: 1,
		maxSpeed: 4,
		drag: 0.005,
		noise: 1,
		maxStamina: 100,
		staminaDrain: 0.25,
		staminaFill: 0.5,
		eatCooldown: 1.5,
		decay: 25
	};

	const perSpecies = new Set(Object.keys(speciesDefaults));

	// border colors cycled through when adding species
	const palette = [
		0x2f86c9, 0xe0635c, 0x5ce07a, 0xe0c95c, 0xb35ce0, 0x5cd8e0, 0xe08b5c,
		0xe05cb8
	];

	function defaultSpecies() {
		return Object.assign({}, speciesDefaults, {
			follow: [true],
			avoid: [false],
			hunt: [false]
		});
	}

	const encode = {
		menu: "a",
		paused: "b",

		toggle: "d",
		desired: "e",
		hideBoids: "x",
		hues: "f",
		stretch: "z",
		areas: "g",
		outlines: "h",
		halfAreas: "y",

		bounce: "i",
		avoidEdges: "E",
		edgeMargin: "F",
		particle: "j",
		accuracyPower: "k",

		debug: "v",
		buckets: "w"
	};

	// codes that per-species settings used before species existed; save
	// strings without an S entry are migrated into a single species
	const legacyEncode = {
		count: "c", // was the global boid count
		vision: "l",
		visionShape: "A",
		visionOffset: "B",
		visionArc: "C",
		visionArcDir: "D",
		alignment: "m",
		bias: "n",
		cohesion: "o",
		separation: "p",
		maxForce: "q",
		minSpeed: "r",
		maxSpeed: "s",
		drag: "t",
		noise: "u"
	};

	const data = Object.assign({}, defaults);
	data.species = [defaultSpecies()];
	data.sel = 0;

	const storageKey = "boidsOpt";

	function serialize() {
		const array = [];

		const entries = Object.entries(data);
		for (const [key, value] of entries) {
			const k = encode[key];

			if (!k) continue;

			if (typeof value === "boolean")
				array.push(`${k}=${value ? "1" : "0"}`);
			else array.push(`${k}=${value}`);
		}

		// species are structured, so they get one url-encoded json entry;
		// encodeURIComponent escapes both "|" and "=", keeping the format safe
		array.push(`S=${encodeURIComponent(JSON.stringify(data.species))}`);

		return array.join("|");
	}

	function normalizeSpecies(s, i, arr) {
		const out = Object.assign(defaultSpecies(), s);
		out.follow = arr.map((_, j) => !!(s.follow?.[j] ?? j === i));
		out.avoid = arr.map((_, j) => !!s.avoid?.[j]);
		out.hunt = arr.map((_, j) => !!s.hunt?.[j]);
		return out;
	}

	function deserialize(str) {
		const args = new Map();
		for (const arg of str.split("|")) {
			const [key, val] = arg.split("=");
			args.set(key, val);
		}

		for (const [key, value] of Object.entries(data)) {
			const param = args.get(encode[key]);
			if (!param) continue;

			if (typeof value === "boolean") {
				data[key] = param !== "0";
			} else {
				data[key] = parseFloat(param);
			}
		}

		data.accuracy = data.accuracyPower >= 10 ? 0 : 2 ** data.accuracyPower;

		const sp = args.get("S");
		if (sp) {
			try {
				const arr = JSON.parse(decodeURIComponent(sp));
				if (Array.isArray(arr) && arr.length)
					data.species = arr.map(normalizeSpecies);
			} catch {}
		} else {
			// pre-species save string: build a single species from the old
			// flat single-letter codes
			const species = defaultSpecies();
			for (const [key, code] of Object.entries(legacyEncode)) {
				const param = args.get(code);
				if (param !== undefined) species[key] = parseFloat(param);
			}
			data.species = [species];
		}
		data.sel = 0;
	}

	function save() {
		// localStorage can throw (private mode, blocked storage); persistence
		// is optional, so keep the app running without it
		try {
			localStorage.setItem(storageKey, serialize());
		} catch {}
	}

	try {
		const saved = localStorage.getItem(storageKey);
		if (saved) deserialize(saved);
	} catch {}
	// never restore transient state: always load unpaused with the menu shown
	data.menu = defaults.menu;
	data.paused = defaults.paused;

	// per-species settings are read and written through the selected species

	function getVal(model) {
		return perSpecies.has(model) ? data.species[data.sel][model] : data[model];
	}

	function setVal(model, value) {
		if (perSpecies.has(model)) data.species[data.sel][model] = value;
		else data[model] = value;
	}

	function hexColor(color) {
		return `#${color.toString(16).padStart(6, "0")}`;
	}

	// detecting data changes

	const checks = document.body.querySelectorAll(
		"input[type=checkbox][data-model]"
	);
	const sliders = document.body.querySelectorAll(
		"input[type=range][data-model]"
	);
	const selects = document.body.querySelectorAll("select[data-model]");

	for (const el of checks) {
		el.addEventListener("input", e => {
			const model = el.dataset.model;
			setVal(model, el.checked);

			if (model === "toggle")
				select("#toggler img").classList.toggle("gone", el.checked);
			else if (
				model === "hideBoids" ||
				model === "areas" ||
				model === "outlines" ||
				model === "halfAreas"
			) {
				g.shapeMode++;
			}

			save();
		});
	}

	for (const el of sliders) {
		const model = el.dataset.model;
		el.addEventListener("input", e => {
			setVal(model, parseFloat(el.value));

			if (model === "maxSpeed") {
				const $min = select("[data-model=minSpeed]");
				$min.max = getVal("maxSpeed");

				if (getVal("maxSpeed") <= getVal("minSpeed")) {
					$min.value = getVal("maxSpeed");
					setVal("minSpeed", getVal("maxSpeed"));
					updateShow($min, "minSpeed");
				}
			} else if (model === "accuracyPower") {
				data.accuracy =
					data.accuracyPower >= 10 ? 0 : 2 ** data.accuracyPower;

				select(`[data-show=accuracy]`).textContent = data.accuracy
					? Math.floor(data.accuracy)
					: "∞";
				save();
				return;
			} else if (model.startsWith("vision")) g.shapeMode++;

			updateShow(el, model);
			save();
		});
	}

	for (const el of selects) {
		el.addEventListener("input", e => {
			setVal(el.dataset.model, parseFloat(el.value));
			g.shapeMode++;
			save();
		});
	}

	select("#speciesColor").addEventListener("input", e => {
		data.species[data.sel].color = parseInt(e.target.value.slice(1), 16);
		renderSpecies();
		if (typeof g !== "undefined") g.shapeMode++;
		save();
	});

	function updateShow(el, model) {
		const digits = el.dataset.digits ? parseInt(el.dataset.digits) : 0;
		select(`[data-show=${model}]`).textContent =
			getVal(model).toFixed(digits);
	}

	function updateAll() {
		renderSpecies();
		for (const el of checks) {
			const model = el.dataset.model;
			el.checked = getVal(model);
			if (model === "toggle")
				select("#toggler img").classList.toggle("gone", el.checked);
		}
		for (const el of sliders) {
			const model = el.dataset.model;
			el.value = getVal(model);
			if (model === "accuracyPower")
				select(`[data-show=accuracy]`).textContent = data.accuracy
					? Math.floor(data.accuracy)
					: "∞";
			else updateShow(el, model);
		}
		for (const el of selects) {
			el.value = getVal(el.dataset.model);
		}
		const $min = select("[data-model=minSpeed]");
		if ($min) $min.max = getVal("maxSpeed");
		if (typeof g !== "undefined") g.shapeMode++;
	}

	// species tabs and the follow/avoid list are rebuilt whenever species
	// are added, removed, selected, or recolored

	function renderSpecies() {
		const active = data.species[data.sel];

		const tabs = select("#species-tabs");
		tabs.replaceChildren();
		data.species.forEach((s, i) => {
			const tab = document.createElement("button");
			tab.type = "button";
			tab.className = "species-tab";
			tab.classList.toggle("active", i === data.sel);
			tab.style.setProperty("--species", hexColor(s.color));
			tab.textContent = i + 1;
			tab.addEventListener("click", () => {
				data.sel = i;
				updateAll();
			});
			tabs.append(tab);
		});

		select("#removeSpecies").disabled = data.species.length <= 1;
		select("#speciesColor").value = hexColor(active.color);

		const rels = select("#species-relations");
		rels.replaceChildren();
		data.species.forEach((s, i) => {
			const row = document.createElement("div");
			row.className = "relation";

			const swatch = document.createElement("span");
			swatch.className = "swatch";
			swatch.style.backgroundColor = hexColor(s.color);

			const name = document.createElement("span");
			name.className = "relation-name";
			name.textContent = `species ${i + 1}`;

			row.append(swatch, name);

			for (const kind of ["follow", "avoid", "hunt"]) {
				const box = document.createElement("input");
				box.type = "checkbox";
				box.id = `${kind}-${i}`;
				box.checked = active[kind][i];
				box.addEventListener("input", () => {
					data.species[data.sel][kind][i] = box.checked;
					save();
				});

				const label = document.createElement("label");
				label.htmlFor = box.id;
				label.textContent = ` ${kind}`;

				row.append(box, label);
			}

			rels.append(row);
		});
	}

	// methods to call from html

	toggleMenu = function () {
		data.menu = !data.menu;
		select("#container").classList.toggle("hidden", !data.menu);
		select("#toggler").classList.toggle("hidden", !data.menu);
	};

	togglePause = () => {
		data.paused = !data.paused;
		select("#pauseButton").checked = data.paused;
	};

	const methods = {
		restart() {
			flock.reset();
		},

		reset() {
			Object.assign(data, defaults);
			data.species = [defaultSpecies()];
			data.sel = 0;
			updateAll();
			save();
		},

		addSpecies() {
			const n = data.species.length;
			const copy = JSON.parse(JSON.stringify(data.species[n - 1]));

			// everyone's relation lists gain a slot for the newcomer, which
			// inherits the last species' relations and follows itself
			for (const s of data.species) {
				s.follow.push(false);
				s.avoid.push(false);
				s.hunt.push(false);
			}
			copy.follow.push(true);
			copy.avoid.push(false);
			copy.hunt.push(false);
			copy.color = palette[n % palette.length];

			data.species.push(copy);
			data.sel = n;
			updateAll();
			save();
		},

		removeSpecies() {
			if (data.species.length <= 1) return;

			const i = data.sel;
			data.species.splice(i, 1);
			for (const s of data.species) {
				s.follow.splice(i, 1);
				s.avoid.splice(i, 1);
				s.hunt.splice(i, 1);
			}
			if (data.sel >= data.species.length)
				data.sel = data.species.length - 1;

			// species indices shifted, so existing boids must be rebuilt
			if (typeof flock !== "undefined") flock.reset();
			updateAll();
			save();
		},

		next() {
			g.nextFrame = true;
		},

		exportSave() {
			select("#exporter").value = btoa(serialize());
			select("#export-popup").classList.add("visible");
			select("#popupwindow").classList.add("visible");
		},

		leaveMenu() {
			select("#popupwindow").classList.remove("visible");
			select("#export-popup").classList.remove("visible");
			select("#import-popup").classList.remove("visible");
		},

		importMenu() {
			select("#importer").value = "";
			select("#import-popup").classList.add("visible");
			select("#popupwindow").classList.add("visible");
		},

		importSave() {
			const str = select("#importer").value.trim();
			if (!str) return;

			let decoded;
			try {
				decoded = atob(str);
			} catch {
				return;
			}
			deserialize(decoded);
			if (typeof flock !== "undefined") flock.reset();
			methods.leaveMenu();
			updateAll();
			save();
		},

		copy() {
			document.getElementById("exporter").select();
			document.execCommand("copy");
		},

		toggleMenu
	};

	updateAll();

	document.body
		.querySelectorAll("[data-click]")
		.forEach(el => el.addEventListener("click", methods[el.dataset.click]));

	return data;
})();
