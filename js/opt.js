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
		boids: 1500,

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
		accuracyPower: 5,
		accuracy: 32,
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

		debug: false,
		buckets: false
	};

	const encode = {
		menu: "a",
		paused: "b",
		boids: "c",

		toggle: "d",
		desired: "e",
		hideBoids: "x",
		hues: "f",
		stretch: "z",
		areas: "g",
		outlines: "h",
		halfAreas: "y",

		bounce: "i",
		particle: "j",
		accuracyPower: "k",
		vision: "l",
		// a-z is exhausted; new settings use uppercase codes
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
		noise: "u",

		debug: "v",
		buckets: "w"
	};

	const data = Object.assign({}, defaults);

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

		return array.join("|");
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
			data[model] = el.checked;

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
			data[model] = parseFloat(el.value);

			if (model === "maxSpeed") {
				const $min = select("[data-model=minSpeed]");
				$min.max = data.maxSpeed;

				if (data.maxSpeed <= data.minSpeed) {
					$min.value = data.maxSpeed;
					data.minSpeed = data.maxSpeed;
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
			data[el.dataset.model] = parseFloat(el.value);
			g.shapeMode++;
			save();
		});
	}

	function updateShow(el, model) {
		const digits = el.dataset.digits ? parseInt(el.dataset.digits) : 0;
		console.log(digits);
		select(`[data-show=${model}]`).textContent =
			data[model].toFixed(digits);
	}

	function updateAll() {
		for (const el of checks) {
			const model = el.dataset.model;
			el.checked = data[model];
			if (model === "toggle")
				select("#toggler img").classList.toggle("gone", el.checked);
		}
		for (const el of sliders) {
			const model = el.dataset.model;
			el.value = data[model];
			if (model === "accuracyPower")
				select(`[data-show=accuracy]`).textContent = data.accuracy
					? Math.floor(data.accuracy)
					: "∞";
			else updateShow(el, model);
		}
		for (const el of selects) {
			el.value = data[el.dataset.model];
		}
		const $min = select("[data-model=minSpeed]");
		if ($min) $min.max = data.maxSpeed;
		if (typeof g !== "undefined") g.shapeMode++;
	}
	updateAll();

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

	document.body
		.querySelectorAll("[data-click]")
		.forEach(el => el.addEventListener("click", methods[el.dataset.click]));

	return data;
})();
