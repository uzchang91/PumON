const canvas = document.getElementById("polyMap");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");

let mapData = [];
let hoveredId = null;
let animationFrameId = null;
let currentView = "SIDO";
let minX, minY, maxX, maxY;

const SIDO_URL = "https://unpkg.com/realmap-collection/kr-sido-low.geo.json";
const GG_URL = "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_municipalities_geo_simple.json";

// sidoValues = 대한민국 "시-도" : value
const sidoValues = {
    "서울특별시": 94, "부산광역시": 78,
    "대구광역시": 65, "인천광역시": 82,
    "광주광역시": 35, "대전광역시": 55,
    "울산광역시": 42, "세종특별자치시": 30,
    "경기도": 38, "강원특별자치도": 25,
    "충청북도": 48, "충청남도": 52,
    "전북특별자치도": 38, "전라남도": 15,
    "경상북도": 44, "경상남도": 58,
    "제주특별자치도": 20
};
// ggValues = 경기도 "시-군" : value,
const ggValues = {
    "가평군": 5, "고양시": 70,
    "광명시": 0, "광주시": 40,
    "과천시": 78, "구리시": 0,
    "군포시": 0, "김포시": 0,
    "남양주시": 58, "동두천시": 21,
    "부천시": 55, "성남시": 62,
    "수원시": 85, "시흥시": 60,
    "안산시": 40, "안성시": 0,
    "안양시": 82, "양주시": 0,
    "양평군": 5, "여주시": 12,
    "연천군": 0, "오산시": 9,
    "용인시": 45, "의왕시": 0,
    "의정부시": 48, "이천시": 41,
    "파주시": 81, "평택시": 75,
    "포천시": 99, "하남시": 0,
    "화성시": 92,
};
if (window.realGGValues) {
    for (const key in window.realGGValues) {
        if (ggValues.hasOwnProperty(key)) {
            ggValues[key] = window.realGGValues[key];
        }
    }
}
window.addEventListener("load", () => {
    if (window.realGGValues) {
        for (const key in window.realGGValues) {
            if (ggValues.hasOwnProperty(key)) {
                ggValues[key] = window.realGGValues[key];
            }
        }
    }
});
/** 1. COLOR & UTILS **/
const getColor = (val) => {
    if (val > 50) return { h: 343, s: 100, l: 47, label: 'red' };
    if (val > 30) return { h: 39, s: 100, l: 46, label: 'yellow' };
    if (val == 0) return { h: 0, s: 0, l: 50, label: 'null' };
    return { h: 145, s: 93, l: 40, label: 'green' };
};

const project = ([lng, lat]) => {
    const scale = Math.min(canvas.width / (maxX - minX), canvas.height / (maxY - minY)) * 0.9;
    const offsetX = (canvas.width - (maxX - minX) * scale) / 2;
    const offsetY = (canvas.height - (maxY - minY) * scale) / 2;
    return [(lng - minX) * scale + offsetX, canvas.height - ((lat - minY) * scale + offsetY)];
};

const drawPath = (coords, offset = { x: 0, y: 0 }) => {
    ctx.beginPath();
    coords.forEach((p, i) => {
        const [px, py] = project(p);
        if (i === 0) ctx.moveTo(px + offset.x, py + offset.y);
        else ctx.lineTo(px + offset.x, py + offset.y);
    });
    ctx.closePath();
};

/** 2. RENDER & ANIMATION **/
const render = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    mapData.forEach(f => {
        const color = getColor(f.value);
        ctx.fillStyle = `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
        f.polygons.forEach(poly => {
            drawPath(poly);
            ctx.fill();
            ctx.strokeStyle = "#e3e3e3";
            ctx.lineWidth = 0.4;
            ctx.stroke();
        });
    });

    mapData.forEach(f => {
        if (f.currentH > 0.1) {
            const color = getColor(f.value);
            ctx.fillStyle = `hsl(${color.h}, ${color.s}%, ${color.l - 15}%)`;
            f.polygons.forEach(poly => {
                for (let i = Math.floor(f.currentH); i > 0; i--) {
                    drawPath(poly, { x: 0, y: -i });
                    ctx.fill();
                }
            });
            ctx.fillStyle = `hsl(${color.h}, ${color.s}%, ${color.l + 8}%)`;
            f.polygons.forEach(poly => {
                drawPath(poly, { x: 0, y: -f.currentH });
                ctx.fill();
                // ctx.strokeStyle = "#fff";
                // ctx.stroke();
            });
        }
    });
};

const animate = () => {
    let moving = false;
    mapData.forEach(f => {
        const target = (f.id === hoveredId) ? Math.max(10, (f.value / 100) * 25) : 0;
        const diff = target - f.currentH;
        if (Math.abs(diff) > 0.1) {
            f.currentH += diff * 0.5; moving = true;
        } else {
            f.currentH = target;
        }
    });
    render();
    if (moving) animationFrameId = requestAnimationFrame(animate);
    else animationFrameId = null;
};

/** 3. LOADER (Fixed Area Math) **/
async function loadMap(url, filterFn, dataMap) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    mapData = [];
    hoveredId = null;
    minX = minY = Infinity;
    maxX = maxY = -Infinity;

    const res = await fetch(url);
    const json = await res.json();
    let features = filterFn ? json.features.filter(filterFn) : json.features;

    const polygonArea = (coords) => {
        let area = 0;
        for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
            area += (coords[j][0] + coords[i][0]) * (coords[j][1] - coords[i][1]);
        }
        return Math.abs(area);
    };

    features.forEach(f => {
        const rings = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(c => c[0]);
        // console.log("SIDO PROPERTIES:", f.properties);
        rings.forEach(ring => ring.forEach(p => {
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]);
            maxY = Math.max(maxY, p[1]);
        }));

        const name =
            f.properties.name ||
            f.properties.name_ko ||
            f.properties.CTP_KOR_NM ||
            f.properties.SIG_KOR_NM;

        let val = 0;
        for (let key in dataMap) {
            if (name.includes(key) || key.includes(name)) {
                val = dataMap[key];
                break;
            }
        }

        // Calculate total area for sorting
        let totalArea = 0;
        rings.forEach(r => totalArea += polygonArea(r));

        mapData.push({
            id: name,
            value: val,
            polygons: rings,
            currentH: 0,
            area: totalArea // ✅ CRITICAL: Store the area so the sort works
        });
    });
    animate();
}

/** 4. INTERACTION (Fixed Hover Math) **/
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();

    // ✅ MATH FIX: Convert viewport coordinates to canvas internal coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let found = null;

    // ✅ MATH FIX: Sort mapData so smaller areas (광주) are checked BEFORE larger areas (전남)
    // This allows the "point in path" to hit the smaller enclave first.
    const sorted = [...mapData].sort((a, b) => a.area - b.area);
    const drawBasePath = (coords) => {
        ctx.beginPath();
        coords.forEach((p, i) => {
            const [px, py] = project(p);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.closePath();
    };

    for (let f of sorted) {
        for (let poly of f.polygons) {
            drawBasePath(poly); // This sets the current path in the context
            if (ctx.isPointInPath(x, y)) {
                found = f;
                break;
            }
        }
        if (found) break;
    }

    if (hoveredId !== (found ? found.id : null)) {
        hoveredId = found ? found.id : null;
        if (!animationFrameId) animate();
    }

    if (found) {
        const info = getColor(found.value);
        tooltip.style.display = "block";
        // ✅ viewport 기준 px 좌표 (해상도 무관)
        tooltip.style.left = `${e.clientX + 48}px`;
        tooltip.style.top = `${e.clientY - 38}px`;

        tooltip.innerHTML = `
            <div class="f-bold">${found.id}</div>
            <div class="val-text">
                수용 상태 :
                <span class="${info.label}">
                    ${found.value}% 사용중
                </span>
            </div>
        `;
    } else {
        tooltip.style.display = "none";
    }
});

canvas.addEventListener("click", () => {
    if (currentView === "SIDO" && hoveredId === "경기도") {
    currentView = "GYEONGGI";

    if (window.realGGValues) {
        for (const key in window.realGGValues) {
            if (ggValues.hasOwnProperty(key)) {
                ggValues[key] = window.realGGValues[key];
            }
        }
    }

    loadMap(GG_URL, f => f.properties.code.startsWith("31"), ggValues);

    } else if (currentView === "GYEONGGI" && hoveredId === null) {
        currentView = "SIDO";
        loadMap(SIDO_URL, null, sidoValues);
    }
});

loadMap(SIDO_URL, null, sidoValues);