const STATION_COORDS = {
    "adugodi": [12.939976, 77.608261],
    "amruthahalli": [13.026195, 77.620281],
    "amruthally": [13.026195, 77.620281],
    "annapoorneshwari nagar": [12.97934, 77.507181],
    "ashoknagar": [12.973816, 77.605335],
    "bagalagunte": [13.063747, 77.496667],
    "bagalakunte": [13.063747, 77.496667],
    "bagalur": [13.132577, 77.667213],
    "bagluru": [13.132577, 77.667213],
    "banashankari": [12.92363, 77.563936],
    "banaswadi": [13.018049, 77.643239],
    "basavanagudi": [12.938516, 77.566753],
    "basavanagoudi": [12.938516, 77.566753],
    "basavanagodi": [12.938516, 77.566753],
    "basaveshwara nagar": [12.994783, 77.537102],
    "beguru": [12.880477, 77.630297],
    "begur": [12.880477, 77.630297],
    "bellanduru": [12.912613, 77.686221],
    "bharathi nagar": [13.01497, 77.721601],
    "byadarahalli": [12.995559, 77.482392],
    "byappanahalli": [12.993484, 77.653836],
    "byatarayanapura": [13.023428, 77.578127],
    "ck achu kattu": [12.928648, 77.556898],
    "chikkajala": [13.148454, 77.626801],
    "city market": [12.964747, 77.576808],
    "citymarket": [12.964747, 77.576808],
    "chikpet": [12.964747, 77.576808],
    "commercial street": [12.982589, 77.607523],
    "cottonpet": [12.968665, 77.584291],
    "cottenpet": [12.968665, 77.584291],
    "cubbon park": [12.975905, 77.602635],
    "devanahalli": [13.242903, 77.710678],
    "devarajeevanahalli": [13.017341, 77.610102],
    "electronic city": [12.864059, 77.657519],
    "freedom park": [12.975905, 77.602635],
    "gangammana gudi": [12.986577, 77.587862],
    "gangammagudi": [12.986577, 77.587862],
    "girinagar": [12.93757, 77.542203],
    "govindapura": [13.034866, 77.620677],
    "govindaraja nagar": [12.975243, 77.536328],
    "h.a.l.": [12.95561, 77.680132],
    "halasur": [12.97211, 77.632274],
    "halasuru": [12.97211, 77.632274],
    "halasurgate": [12.971362, 77.583407],
    "hanumanthanagar": [12.942212, 77.561299],
    "hennur": [13.027518, 77.634143],
    "high grounds": [12.98668, 77.584523],
    "hsr layout": [12.922723, 77.643967],
    "hsr": [12.922723, 77.643967],
    "hulimavu": [12.993728, 77.605255],
    "indiranagar": [12.976858, 77.645269],
    "indranagar": [12.976858, 77.645269],
    "j.c. nagar": [13.005222, 77.630044],
    "jagajeevanram nagar": [12.965619, 77.550676],
    "jalahalli": [13.045351, 77.549317],
    "jeevan bheemanagar": [12.946458, 77.636614],
    "jnanabharathi": [12.945842, 77.489658],
    "k.r. puram": [13.010391, 77.694127],
    "kr puram": [13.010391, 77.694127],
    "kadugodi": [12.999714, 77.760206],
    "kadugondana halli": [13.009681, 77.625495],
    "kalasipalya": [12.9635, 77.577525],
    "kamakshipalya": [12.982824, 77.525243],
    "kamashipalya": [12.982824, 77.525243],
    "kempapura agrahara": [12.980277, 77.541586],
    "kempegowda nagar": [12.947328, 77.563375],
    "kg halli": [12.947328, 77.563375],
    "kengeri": [12.932749, 77.508501],
    "kodigehalli": [13.067703, 77.582016],
    "konanakunte": [12.880079, 77.566831],
    "koramangala": [12.939779, 77.609329],
    "kormangala": [12.939779, 77.609329],
    "kothanur": [13.058029, 77.645758],
    "kumbalagudu": [12.885202, 77.449884],
    "kumaraswamy layout": [12.915605, 77.573225],
    "madivala": [12.923691, 77.617293],
    "madivale": [12.923691, 77.617293],
    "magadi road": [12.980696, 77.526492],
    "magadi main road": [12.980696, 77.526492],
    "mahadevapura": [12.981576, 77.700927],
    "mahadevpura": [12.981576, 77.700927],
    "mahalakshmipuram": [13.007717, 77.543802],
    "mahalakshmi": [13.007717, 77.543802],
    "malleshwaram": [12.999272, 77.570509],
    "marathahalli": [12.952474, 77.703073],
    "mico layout": [12.908067, 77.613508],
    "nandini layout": [13.013662, 77.533938],
    "parappana agrahara": [12.922856, 77.673123],
    "peenya": [13.01733, 77.52655],
    "pulakeshinagar": [13.005674, 77.613568],
    "pulkeshinagar": [13.005674, 77.613568],
    "puttenahalli": [12.893826, 77.581285],
    "r.m.c. yard": [13.02447, 77.548764],
    "r.t. nagar": [13.017486, 77.591733],
    "rt nagar": [13.017486, 77.591733],
    "rajagopal nagar": [12.990165, 77.548278],
    "rajgolpalnagar": [12.990165, 77.548278],
    "rajajinagar": [12.986261, 77.550149],
    "rajarajeshwari nagar": [12.91486, 77.52064],
    "ramamurthy nagar": [13.016567, 77.668368],
    "rammurthy nagar": [13.016567, 77.668368],
    "rammurthynagar": [13.016567, 77.668368],
    "s.j. park": [12.964214, 77.582521],
    "sadashivanagar": [13.01363, 77.577065],
    "sampangiramanagar": [12.980758, 77.613904],
    "sampigehalli": [13.040902, 77.643128],
    "sanjay nagar": [13.032932, 77.575956],
    "seshadripuram": [12.984624, 77.563188],
    "shivajinagar": [12.995773, 77.609703],
    "shivaji nagar": [12.995773, 77.609703],
    "siddapura": [12.956632, 77.733417],
    "soladevanahalli": [13.05907, 77.493516],
    "srirampura": [12.993165, 77.564996],
    "subramanyanagar": [13.007805, 77.557121],
    "subrayamanyapura": [12.902599, 77.539907],
    "subrayamanayapura": [12.902599, 77.539907],
    "suddaguntepalya": [12.931169, 77.61307],
    "thalaghattapura": [12.872189, 77.532587],
    "thilaknagar": [12.925, 77.598659],
    "upparpet": [12.977916, 77.582188],
    "varthur": [12.91709, 77.69959],
    "vidyaranyapura": [13.075708, 77.558325],
    "vidhana soudha": [12.979603, 77.590853],
    "vijayanagar": [12.96761, 77.541983],
    "viveknagar": [12.944303, 77.620639],
    "vyalikaval": [12.991142, 77.567693],
    "whitefield": [12.969333, 77.745094],
    "wilsongarden": [12.951094, 77.595166],
    "yelahanka new town": [13.099184, 77.577602],
    "yelahanka": [13.108977, 77.601409],
    "yeshwanthapura": [13.013278, 77.547641],
    "btm": [12.922723, 77.643967],
    "sg palya": [12.922723, 77.643967],
    "pottery town": [13.005674, 77.613568],
    "chinnaswamy": [12.979603, 77.590853],
    "church street": [12.979603, 77.590853],
    "indra nagar": [12.976858, 77.645269],
    "shantinagar": [12.973816, 77.605335],
    "magadi rd": [12.980696, 77.526492],
    "gottigere": [12.880477, 77.630297],
    "basangudi": [12.938516, 77.566753],
    "amrutahalli": [13.026195, 77.620281],
    "mahadevpurs": [12.981576, 77.700927],
    "rajkumar road": [12.986261, 77.550149],
    "mm layout": [12.999272, 77.570509],
    "ullas": [12.980696, 77.526492],
    "ullal": [12.980696, 77.526492],
    "koramangla": [12.939779, 77.609329],
}

export const STATION_KEYS = Object.keys(STATION_COORDS).sort((a, b) => b.length - a.length)

/** Return the matched station/PS area name for a device, or null */
export function extractArea(device) {
    const normalized = (device.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    for (const key of STATION_KEYS) {
        if (normalized.includes(key)) {
            // Title-case the key for display
            return key.replace(/\b\w/g, c => c.toUpperCase())
        }
    }
    return null
}

export function resolvePosition(device, deviceIndex) {
    const HQ = [16.4, 80.55] // Guntur/Vijayawada region centroid (deployment area)

    // 1. Honor any stored lat/lng that is a sane real coordinate (was gated to a
    //    Bangalore-only box, which rejected the real Guntur cameras at ~16.3,80.4).
    const lat = parseFloat(device.latitude)
    const lng = parseFloat(device.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
        (lat !== 0 || lng !== 0)) {
        return [lat, lng]
    }

    // 2. Match device name to a station keyword
    const normalized = (device.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    for (const key of STATION_KEYS) {
        if (normalized.includes(key)) {
            const base = STATION_COORDS[key]
            const PHI = 1.6180339887
            const angle = deviceIndex * PHI * 2 * Math.PI
            const radius = 0.0018 * Math.sqrt(deviceIndex % 20 + 1)
            return [
                base[0] + radius * Math.cos(angle),
                base[1] + radius * Math.sin(angle),
            ]
        }
    }

    // 3. Fallback: deterministic spiral near HQ
    const PHI = 1.6180339887
    const angle = deviceIndex * PHI * 2 * Math.PI
    const radius = 0.008 * Math.sqrt(deviceIndex % 50 + 1)
    return [
        HQ[0] + radius * Math.cos(angle),
        HQ[1] + radius * Math.sin(angle),
    ]
}
