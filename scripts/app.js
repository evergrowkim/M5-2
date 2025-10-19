'use strict';

// ========================================
// 데이터 관리 계층
// ========================================

// 마스터 데이터 저장소
const dataStore = {
    project: {
        name: '전주 기지촌 주택 재개발 정비사업',
        code: 'JJ-2024-001',
        client: '전주시청',
        date: '2024-01-15'
    },
    boreholes: [], // 시추공 마스터 리스트
    analysisResults: {}, // 분석 결과 저장
    currentBoreholeId: null, // 현재 선택된 시추공
    layerParameters: {}, // 시추공별 사용자 수정 파라미터 저장
    plannedExcavationLevel: 45.47 // 계획 굴착 레벨
};

// 지지력 계수 테이블 (Terzaghi)
const terzaghiFactors = {
    0: {Nc: 5.14, Nq: 1.00, Ngamma: 0.00},
    5: {Nc: 6.49, Nq: 1.57, Ngamma: 0.45},
    10: {Nc: 8.35, Nq: 2.47, Ngamma: 1.22},
    15: {Nc: 10.98, Nq: 3.94, Ngamma: 2.65},
    20: {Nc: 14.83, Nq: 6.40, Ngamma: 5.39},
    25: {Nc: 20.72, Nq: 10.66, Ngamma: 10.88},
    28: {Nc: 25.80, Nq: 14.72, Ngamma: 16.72},
    29: {Nc: 27.86, Nq: 16.44, Ngamma: 19.34},
    30: {Nc: 30.14, Nq: 18.40, Ngamma: 22.40},
    31: {Nc: 32.67, Nq: 20.63, Ngamma: 26.00},
    32: {Nc: 35.49, Nq: 23.18, Ngamma: 30.22},
    33: {Nc: 38.64, Nq: 26.09, Ngamma: 35.19},
    34: {Nc: 42.16, Nq: 29.44, Ngamma: 41.06},
    35: {Nc: 46.12, Nq: 33.30, Ngamma: 48.03},
    36: {Nc: 50.59, Nq: 37.75, Ngamma: 56.31},
    37: {Nc: 55.63, Nq: 42.92, Ngamma: 66.19},
    38: {Nc: 61.35, Nq: 48.93, Ngamma: 78.03},
    39: {Nc: 67.87, Nq: 55.96, Ngamma: 92.25},
    40: {Nc: 75.31, Nq: 64.20, Ngamma: 109.41}
};

// 시추공 클래스 정의
class Borehole {
    constructor(id, name, x, y, elevation, excavationLevel = null) {
        this.id = id;
        this.name = name;
        this.location = { x: x, y: y };
        this.elevation = elevation; // 지표면 표고
        this.excavationLevel = excavationLevel || dataStore.plannedExcavationLevel; // 굴착 레벨
        this.layers = []; // 지층 정보
        this.waterTableDepth = 2.0; // 지하수위 깊이 (원지반 기준)
        this.status = 'incomplete'; // complete, incomplete, analyzed
        this.createdAt = new Date();
        this.modifiedAt = new Date();
    }

    addLayer(layer) {
        this.layers.push(layer);
        this.modifiedAt = new Date();
    }

    getTotalDepth() {
        if (this.layers.length === 0) return 0;
        return Math.max(...this.layers.map(l => l.bottomDepth));
    }

    getLayerCount() {
        return this.layers.length;
    }

    getExcavationDepth() {
        return this.elevation - this.excavationLevel;
    }
}

// 지층 클래스 정의
class SoilLayer {
    constructor(topDepth, bottomDepth, soilType, nValue, color = '#DEB887') {
        this.topDepth = topDepth;
        this.bottomDepth = bottomDepth;
        this.soilType = soilType;
        this.nValue = nValue;
        this.color = color;
        this.parameters = this.calculateRecommendedParameters();
    }

    getThickness() {
        return this.bottomDepth - this.topDepth;
    }

    // N값 기반 지반정수 추천 함수
    calculateRecommendedParameters() {
        const Nvalue = this.nValue;
        const soilType = this.soilType;

        let phi, c, gamma, gammaSat, Em, Vs, poisson, avgIz;

        // 내부마찰각 φ (Meyerhof, 1976; Peck et al., 1974)
        if (soilType.includes('모래') || soilType.includes('사질')) {
            if (Nvalue <= 4) phi = 26 + Nvalue * 2;
            else if (Nvalue <= 10) phi = 28 + Nvalue * 0.5;
            else if (Nvalue <= 30) phi = 30 + (Nvalue - 10) * 0.3;
            else if (Nvalue <= 50) phi = 36 + (Nvalue - 30) * 0.15;
            else phi = Math.min(45, 39 + (Nvalue - 50) * 0.1);
        } else if (soilType.includes('실트') || soilType.includes('점토')) {
            phi = 25 + Math.sqrt(Nvalue) * 3;
            phi = Math.min(phi, 35);
        } else if (soilType.includes('풍화토')) {
            phi = 27 + Math.sqrt(Nvalue) * 2.5;
        } else if (soilType.includes('풍화암')) {
            phi = 30 + Math.sqrt(Nvalue) * 2;
            phi = Math.min(phi, 40);
        } else if (soilType.includes('암')) {
            phi = 35 + Math.sqrt(Nvalue);
            phi = Math.min(phi, 45);
        } else {
            // 매립층 등 기타
            phi = 25 + Math.sqrt(Nvalue) * 2;
        }

        // 점착력 c (Terzaghi & Peck, 1967)
        if (soilType.includes('모래') || soilType.includes('사질')) {
            c = 0;
        } else if (soilType.includes('실트')) {
            c = 2.5 * Nvalue;
        } else if (soilType.includes('점토')) {
            c = 6.25 * Nvalue;
        } else if (soilType.includes('풍화토')) {
            c = 10 + Nvalue * 0.5;
        } else if (soilType.includes('풍화암')) {
            c = 50 + Nvalue * 1.0;
        } else if (soilType.includes('암')) {
            c = 100 + Nvalue * 2.0;
        } else {
            c = 5 + Nvalue * 0.5;
        }

        // 단위중량 γ (Bowles, 1997)
        if (Nvalue <= 4) {
            gamma = 16.0;
            gammaSat = 18.0;
        } else if (Nvalue <= 10) {
            gamma = 17.0;
            gammaSat = 19.0;
        } else if (Nvalue <= 30) {
            gamma = 18.0;
            gammaSat = 20.0;
        } else if (Nvalue <= 50) {
            gamma = 19.0;
            gammaSat = 21.0;
        } else {
            gamma = 20.0;
            gammaSat = 22.0;
        }

        // 암반의 경우 단위중량 증가
        if (soilType.includes('풍화암')) {
            gamma = 20.0;
            gammaSat = 22.0;
        } else if (soilType.includes('암')) {
            gamma = 23.0;
            gammaSat = 25.0;
        }

        // 변형계수 Em (Bowles, 1997; 도로교설계기준, 2016)
        if (soilType.includes('모래')) {
            Em = 2.5 * Nvalue + 15;
        } else if (soilType.includes('실트')) {
            Em = 2.0 * Nvalue + 10;
        } else if (soilType.includes('점토')) {
            Em = 1.5 * Nvalue + 5;
        } else if (soilType.includes('풍화토')) {
            Em = 3.0 * Nvalue + 20;
        } else if (soilType.includes('풍화암')) {
            Em = 10.0 * Nvalue + 100;
        } else if (soilType.includes('암')) {
            Em = 50.0 * Nvalue + 500;
        } else {
            Em = 2.0 * Nvalue + 10;
        }

        // 전단파속도 Vs (일본도로협회, 2002)
        Vs = 80 * Math.pow(Nvalue, 1/3);
        if (soilType.includes('암')) Vs = Math.max(Vs, 700);

        // 포아송비 ν
        if (soilType.includes('모래')) poisson = 0.30;
        else if (soilType.includes('점토')) poisson = 0.40;
        else if (soilType.includes('암')) poisson = 0.20;
        else poisson = 0.35;

        // 평균 변형영향계수 Iz (Schmertmann, 1978)
        if (soilType.includes('모래')) avgIz = 0.20;
        else if (soilType.includes('점토')) avgIz = 0.25;
        else if (soilType.includes('풍화암')) avgIz = 0.30;
        else if (soilType.includes('암')) avgIz = 0.10;
        else avgIz = 0.22;

        return {
            phi: Math.round(phi * 10) / 10,
            c: Math.round(c * 10) / 10,
            gamma: Math.round(gamma * 10) / 10,
            gammaSat: Math.round(gammaSat * 10) / 10,
            Em: Math.round(Em * 10) / 10,
            Vs: Math.round(Vs),
            poisson: poisson,
            avgIz: avgIz
        };
    }
}

// ========================================
// 지지력 계산 함수들 (굴착 레벨 고려)
// ========================================

function getTerzaghiFactors(phi) {
    const phiInt = Math.floor(phi);
    if (terzaghiFactors[phiInt]) {
        if (phiInt === phi) {
            return terzaghiFactors[phiInt];
        }
        const nextPhi = phiInt + 1;
        if (terzaghiFactors[nextPhi]) {
            const t = phi - phiInt;
            return {
                Nc: terzaghiFactors[phiInt].Nc + t * (terzaghiFactors[nextPhi].Nc - terzaghiFactors[phiInt].Nc),
                Nq: terzaghiFactors[phiInt].Nq + t * (terzaghiFactors[nextPhi].Nq - terzaghiFactors[phiInt].Nq),
                Ngamma: terzaghiFactors[phiInt].Ngamma + t * (terzaghiFactors[nextPhi].Ngamma - terzaghiFactors[phiInt].Ngamma)
            };
        }
    }
    // 테이블에 없으면 계산식 사용
    const phiRad = phi * Math.PI / 180;
    const Nq = Math.exp(Math.PI * Math.tan(phiRad)) * Math.pow(Math.tan(Math.PI / 4 + phiRad / 2), 2);
    const Nc = (Nq - 1) / Math.tan(phiRad);
    const Ngamma = 2 * (Nq + 1) * Math.tan(phiRad);
    return { Nc, Nq, Ngamma };
}

function analyzeAndConvertLayers(borehole, Df) {
    const groundEL = borehole.elevation;
    const excavationEL = borehole.excavationLevel;
    const B = parseFloat(document.getElementById('foundationWidth').value);
    const waterTableDepth = parseFloat(document.getElementById('waterTable').value) || 2.0;

    // 굴착 깊이 계산
    const excavationDepth = groundEL - excavationEL;

    // 기초 저면 깊이 (원지반 기준)
    const foundationBottomDepth = excavationDepth + Df;
    const foundationBottomEL = groundEL - foundationBottomDepth;

    // 영향 깊이 (정방형 기초: 2B)
    const influenceDepth = foundationBottomDepth + 2 * B;

    // 시추 최대 깊이
    const maxBoringDepth = borehole.getTotalDepth();

    const effectiveLayers = [];
    let bearingLayer = null;

    borehole.layers.forEach((layer, idx) => {
        if (layer.bottomDepth > foundationBottomDepth) {
            const effectiveTopDepth = Math.max(layer.topDepth, foundationBottomDepth);
            const effectiveBottomDepth = layer.bottomDepth;
            const thickness = effectiveBottomDepth - effectiveTopDepth;

            if (thickness > 0) {
                // 사용자 수정 파라미터 확인
                const paramKey = `${borehole.id}_${idx}`;
                const params = dataStore.layerParameters[paramKey] || layer.parameters;

                // 유효단위중량 계산 (수중단위중량 고려)
                let effectiveGamma;
                if (effectiveTopDepth >= waterTableDepth) {
                    // 완전히 지하수위 아래
                    effectiveGamma = params.gammaSat - 9.81; // 수중단위중량
                } else if (effectiveBottomDepth <= waterTableDepth) {
                    // 완전히 지하수위 위
                    effectiveGamma = params.gamma;
                } else {
                    // 부분적으로 잠김
                    const aboveWaterThickness = waterTableDepth - effectiveTopDepth;
                    const belowWaterThickness = effectiveBottomDepth - waterTableDepth;
                    effectiveGamma = (params.gamma * aboveWaterThickness + (params.gammaSat - 9.81) * belowWaterThickness) / thickness;
                }

                const layerInfo = {
                    soilType: layer.soilType,
                    topDepth: effectiveTopDepth,
                    bottomDepth: effectiveBottomDepth,
                    thickness: thickness,
                    Nvalue: layer.nValue,
                    Em: params.Em,
                    avgIz: params.avgIz,
                    gamma: params.gamma,
                    gammaSat: params.gammaSat,
                    effectiveGamma: effectiveGamma,
                    poisson: params.poisson,
                    phi: params.phi,
                    c: params.c,
                    Vs: params.Vs,
                    topElevation: (groundEL - effectiveTopDepth).toFixed(2),
                    bottomElevation: (groundEL - effectiveBottomDepth).toFixed(2),
                    isBelowWaterTable: effectiveTopDepth >= waterTableDepth
                };

                effectiveLayers.push(layerInfo);

                if (bearingLayer === null) {
                    bearingLayer = layerInfo;
                }
            }
        }
    });

    // 보수적 가정: 시추 깊이 이하는 마지막 지층 연장
    if (maxBoringDepth < influenceDepth && effectiveLayers.length > 0) {
        const lastLayer = effectiveLayers[effectiveLayers.length - 1];
        const extendedThickness = influenceDepth - maxBoringDepth;

        effectiveLayers.push({
            soilType: `${lastLayer.soilType} (연장)`,
            topDepth: maxBoringDepth,
            bottomDepth: influenceDepth,
            thickness: extendedThickness,
            Nvalue: lastLayer.Nvalue,
            Em: lastLayer.Em,
            avgIz: lastLayer.avgIz,
            gamma: lastLayer.gamma,
            gammaSat: lastLayer.gammaSat,
            effectiveGamma: lastLayer.effectiveGamma,
            poisson: lastLayer.poisson,
            phi: lastLayer.phi,
            c: lastLayer.c,
            Vs: lastLayer.Vs,
            topElevation: (groundEL - maxBoringDepth).toFixed(2),
            bottomElevation: (groundEL - influenceDepth).toFixed(2),
            isExtended: true,
            isBelowWaterTable: maxBoringDepth >= waterTableDepth
        });
    }

    return {
        groundEL,
        excavationEL,
        excavationDepth,
        Df,
        foundationBottomDepth,
        foundationBottomEL,
        influenceDepth,
        maxBoringDepth,
        bearingLayer,
        effectiveLayers,
        waterTableDepth
    };
}

function calculateBearingCapacity(layerAnalysis, method) {
    const B = parseFloat(document.getElementById('foundationWidth').value);
    const L = parseFloat(document.getElementById('foundationLength').value);
    const Q = parseFloat(document.getElementById('designLoad').value);
    const safetyFactor = parseFloat(document.getElementById('safetyFactor').value);
    const Df = layerAnalysis.Df;

    const bearingLayer = layerAnalysis.bearingLayer;
    const phi = bearingLayer.phi;
    const c = bearingLayer.c;
    const gamma = bearingLayer.effectiveGamma;

    // 굴착면 위 흙의 유효단위중량 계산
    const excavationDepth = layerAnalysis.excavationDepth;
    const waterTableDepth = layerAnalysis.waterTableDepth;

    let gammaSurcharge;
    if (excavationDepth <= waterTableDepth) {
        // 굴착면이 지하수위 위에 있음
        gammaSurcharge = gamma;
    } else {
        // 굴착면이 지하수위 아래에 있음 (수중단위중량 사용)
        gammaSurcharge = bearingLayer.gammaSat - 9.81;
    }

    let Nc, Nq, Ngamma, alpha, beta;

    if (method === 'Terzaghi') {
        const factors = getTerzaghiFactors(phi);
        Nc = factors.Nc;
        Nq = factors.Nq;
        Ngamma = factors.Ngamma;

        const ratio = B / L;
        if (ratio >= 0.9 && ratio <= 1.1) {
            alpha = 1.3;
            beta = 0.4;
        } else {
            alpha = 1.0;
            beta = 0.5;
        }

        const term1 = alpha * c * Nc;
        const term2 = gammaSurcharge * Df * Nq;
        const term3 = beta * gamma * B * Ngamma;
        const qult = term1 + term2 + term3;
        const qa = qult / safetyFactor;

        return {
            method,
            bearingSoil: bearingLayer.soilType,
            Df: Df.toFixed(2),
            phi: phi.toFixed(1),
            c: c.toFixed(2),
            gamma: gamma.toFixed(2),
            gammaSurcharge: gammaSurcharge.toFixed(2),
            Nc: Nc.toFixed(2),
            Nq: Nq.toFixed(2),
            Ngamma: Ngamma.toFixed(2),
            alpha: alpha.toFixed(2),
            beta: beta.toFixed(2),
            term1: term1.toFixed(2),
            term2: term2.toFixed(2),
            term3: term3.toFixed(2),
            qult: qult.toFixed(2),
            qa: qa.toFixed(2),
            Q,
            isCheck: qa > Q,
            actualSF: (qult / Q).toFixed(2),
            excavationDepth: excavationDepth.toFixed(2)
        };
    }

    if (method === 'Meyerhof') {
        const phiRad = phi * Math.PI / 180;
        const tanPhi = Math.tan(phiRad);
        Nq = Math.exp(Math.PI * tanPhi) * Math.pow(Math.tan(Math.PI / 4 + phiRad / 2), 2);
        Nc = (Nq - 1) / tanPhi;
        Ngamma = (Nq - 1) * Math.tan(1.4 * phiRad);

        const sc = 1 + 0.2 * (B / L);
        const sq = sc;
        const sgamma = 1 + 0.1 * (B / L);

        const dc = 1 + 0.2 * (Df / B);
        const dq = dc;
        const dgamma = dc;

        const term1 = c * Nc * sc * dc;
        const term2 = 0.5 * gamma * B * Ngamma * sgamma * dgamma;
        const term3 = gammaSurcharge * Df * Nq * sq * dq;
        const qult = term1 + term2 + term3;
        const qa = qult / safetyFactor;

        return {
            method,
            bearingSoil: bearingLayer.soilType,
            Df: Df.toFixed(2),
            phi: phi.toFixed(1),
            c: c.toFixed(2),
            gamma: gamma.toFixed(2),
            gammaSurcharge: gammaSurcharge.toFixed(2),
            Nc: Nc.toFixed(2),
            Nq: Nq.toFixed(2),
            Ngamma: Ngamma.toFixed(2),
            sc: sc.toFixed(2),
            sq: sq.toFixed(2),
            sgamma: sgamma.toFixed(2),
            dc: dc.toFixed(2),
            dq: dq.toFixed(2),
            dgamma: dgamma.toFixed(2),
            term1: term1.toFixed(2),
            term2: term2.toFixed(2),
            term3: term3.toFixed(2),
            qult: qult.toFixed(2),
            qa: qa.toFixed(2),
            Q,
            isCheck: qa > Q,
            actualSF: (qult / Q).toFixed(2),
            excavationDepth: excavationDepth.toFixed(2)
        };
    }

    if (method === 'Hansen') {
        const phiRad = phi * Math.PI / 180;
        const tanPhi = Math.tan(phiRad);
        const sinPhi = Math.sin(phiRad);
        Nq = Math.exp(Math.PI * tanPhi) * Math.pow(Math.tan(Math.PI / 4 + phiRad / 2), 2);
        Nc = (Nq - 1) / tanPhi;
        Ngamma = 1.5 * (Nq - 1) * tanPhi;

        const sc = 1 + (B / L) * (Nq / Nc);
        const sq = 1 + (B / L) * tanPhi;
        const sgamma = 1 - 0.4 * (B / L);

        let dc, dq, dgamma;
        const DfB_ratio = Df / B;

        if (DfB_ratio <= 1) {
            const factor = Math.pow(1 - sinPhi, 2);
            dq = 1 + 2 * tanPhi * factor * DfB_ratio;
            dc = 1 + 2 * tanPhi * factor * Math.atan(DfB_ratio);
            dgamma = 1.0;
        } else {
            const factor = Math.pow(1 - sinPhi, 2);
            dq = 1 + 2 * tanPhi * factor * Math.atan(DfB_ratio);
            dc = 1 + 0.4 * Math.atan(DfB_ratio);
            dgamma = 1.0;
        }

        const ic = 1.0;
        const iq = 1.0;
        const igamma = 1.0;

        const term1 = c * Nc * sc * dc * ic;
        const term2 = 0.5 * gamma * B * Ngamma * sgamma * dgamma * igamma;
        const term3 = gammaSurcharge * Df * Nq * sq * dq * iq;
        const qult = term1 + term2 + term3;
        const qa = qult / safetyFactor;

        return {
            method,
            bearingSoil: bearingLayer.soilType,
            Df: Df.toFixed(2),
            phi: phi.toFixed(1),
            c: c.toFixed(2),
            gamma: gamma.toFixed(2),
            gammaSurcharge: gammaSurcharge.toFixed(2),
            Nc: Nc.toFixed(2),
            Nq: Nq.toFixed(2),
            Ngamma: Ngamma.toFixed(2),
            sc: sc.toFixed(3),
            sq: sq.toFixed(3),
            sgamma: sgamma.toFixed(3),
            dc: dc.toFixed(3),
            dq: dq.toFixed(3),
            dgamma: dgamma.toFixed(3),
            DfB_ratio: DfB_ratio.toFixed(3),
            sinPhi: sinPhi.toFixed(3),
            tanPhi: tanPhi.toFixed(3),
            term1: term1.toFixed(2),
            term2: term2.toFixed(2),
            term3: term3.toFixed(2),
            qult: qult.toFixed(2),
            qa: qa.toFixed(2),
            Q,
            isCheck: qa > Q,
            actualSF: (qult / Q).toFixed(2),
            excavationDepth: excavationDepth.toFixed(2)
        };
    }

    return null;
}

function calculateSettlement(layerAnalysis) {
    const Q = parseFloat(document.getElementById('designLoad').value);
    const designLife = parseFloat(document.getElementById('designLife').value);
    const Df = layerAnalysis.Df;
    const gammaEff = layerAnalysis.bearingLayer.effectiveGamma;

    // 굴착 후 상재하중 계산
    const qPrime = gammaEff * Df;
    const deltaP = Q - qPrime;

    let C1 = 1 - 0.5 * (qPrime / deltaP);
    C1 = Math.max(0.5, Math.min(1.0, C1));

    const C2 = 1 + 0.2 * Math.log10(designLife / 0.1);

    let sumIzOverEm_Dz = 0;
    const layerCalcs = layerAnalysis.effectiveLayers.map((layer, idx) => {
        const IzOverEm = layer.avgIz / layer.Em;
        const IzOverEm_Dz = IzOverEm * layer.thickness;
        sumIzOverEm_Dz += IzOverEm_Dz;

        return {
            layerNum: idx + 1,
            soilType: layer.soilType,
            thickness: layer.thickness.toFixed(2),
            Em: layer.Em,
            avgIz: layer.avgIz.toFixed(2),
            IzOverEm: IzOverEm.toFixed(6),
            IzOverEm_Dz: IzOverEm_Dz.toFixed(5),
            isExtended: layer.isExtended || false
        };
    });

    const deltaP_MPa = deltaP / 1000;
    const settlement_m = C1 * C2 * deltaP_MPa * sumIzOverEm_Dz;
    const settlement_mm = settlement_m * 1000;
    const allowableSettlement = parseFloat(document.getElementById('allowableSettlement').value);
    const isOK = settlement_mm < allowableSettlement;

    return {
        Df: Df.toFixed(2),
        gammaEff: gammaEff.toFixed(2),
        qPrime: qPrime.toFixed(2),
        deltaP: deltaP.toFixed(2),
        deltaP_MPa: deltaP_MPa.toFixed(4),
        C1: C1.toFixed(3),
        C2: C2.toFixed(3),
        sumIzOverEm_Dz: sumIzOverEm_Dz.toFixed(5),
        settlement: settlement_mm.toFixed(2),
        allowableSettlement,
        isOK,
        layerCalcs,
        designLife
    };
}

// ========================================
// 초기화 및 샘플 데이터
// ========================================

function initializeSystem() {
    // 샘플 시추공 데이터 생성
    const sampleBoreholes = [
        { name: 'NBH-1', x: 0, y: 0, elevation: 51.05, excavation: 45.47 },
        { name: 'NBH-2', x: 50, y: 0, elevation: 51.23, excavation: 45.65 },
        { name: 'NBH-3', x: 100, y: 0, elevation: 50.87, excavation: 45.29 },
        { name: 'NBH-4', x: 0, y: 50, elevation: 51.15, excavation: 45.57 },
        { name: 'NBH-5', x: 50, y: 50, elevation: 51.42, excavation: 45.84 }
    ];

    sampleBoreholes.forEach((bh, index) => {
        const borehole = new Borehole(
            `bh-${Date.now()}-${index}`,
            bh.name,
            bh.x,
            bh.y,
            bh.elevation,
            bh.excavation
        );

        // 샘플 지층 데이터 추가
        if (index === 0) {
            borehole.addLayer(new SoilLayer(0, 6.18, '매립층', 10, '#D2B48C'));
            borehole.addLayer(new SoilLayer(6.18, 13.30, '풍화토', 25, '#DEB887'));
            borehole.addLayer(new SoilLayer(13.30, 27.34, '풍화암', 50, '#A0522D'));
            borehole.addLayer(new SoilLayer(27.34, 31.00, '연암', 100, '#696969'));
            borehole.status = 'complete';
        } else if (index === 1) {
            borehole.addLayer(new SoilLayer(0, 5.5, '매립층', 8, '#D2B48C'));
            borehole.addLayer(new SoilLayer(5.5, 12.8, '풍화토', 22, '#DEB887'));
            borehole.addLayer(new SoilLayer(12.8, 25.5, '풍화암', 48, '#A0522D'));
            borehole.addLayer(new SoilLayer(25.5, 30.0, '연암', 95, '#696969'));
            borehole.status = 'complete';
        } else if (index === 2) {
            borehole.addLayer(new SoilLayer(0, 7.2, '매립층', 12, '#D2B48C'));
            borehole.addLayer(new SoilLayer(7.2, 14.5, '풍화토', 28, '#DEB887'));
            borehole.addLayer(new SoilLayer(14.5, 26.8, '풍화암', 52, '#A0522D'));
            borehole.addLayer(new SoilLayer(26.8, 32.0, '연암', 98, '#696969'));
            borehole.status = 'complete';
        }

        dataStore.boreholes.push(borehole);
    });

    // 평균 지표고 계산 및 표시
    updateAverageGroundLevel();
    renderBoreholeList();
    updateExcavationInfo();
}

function updateAverageGroundLevel() {
    if (dataStore.boreholes.length > 0) {
        const avgElevation = dataStore.boreholes.reduce((sum, bh) => sum + bh.elevation, 0) / dataStore.boreholes.length;
        document.getElementById('averageGroundLevel').value = avgElevation.toFixed(2);
    }
}

function updateExcavationInfo() {
    const plannedLevel = parseFloat(document.getElementById('plannedExcavationLevel').value);
    const avgGroundLevel = parseFloat(document.getElementById('averageGroundLevel').value) || 51.05;
    const embedmentDepth = parseFloat(document.getElementById('embedmentDepth').value) || 1.08;

    dataStore.plannedExcavationLevel = plannedLevel;

    const excavationDepth = avgGroundLevel - plannedLevel;
    const foundationBottomEL = plannedLevel - embedmentDepth;

    document.getElementById('excavationDepthDisplay').textContent = `${excavationDepth.toFixed(2)} m`;
    document.getElementById('foundationBottomEL').textContent = foundationBottomEL.toFixed(2);

    // 레벨 정보 요약 업데이트
    document.getElementById('avgGroundLevel').textContent = avgGroundLevel.toFixed(2);
    document.getElementById('excLevel').textContent = plannedLevel.toFixed(2);
    document.getElementById('foundLevel').textContent = foundationBottomEL.toFixed(2);
    document.getElementById('excDepth').textContent = excavationDepth.toFixed(2);
    document.getElementById('embedDepth').textContent = embedmentDepth.toFixed(2);

    // 모든 시추공의 굴착 레벨 업데이트
    dataStore.boreholes.forEach(bh => {
        bh.excavationLevel = plannedLevel;
    });
}

// ========================================
// UI 렌더링 함수
// ========================================

function renderBoreholeList() {
    const tbody = document.getElementById('boreholeList');
    if (!tbody) {
        return;
    }
    tbody.innerHTML = '';

    dataStore.boreholes.forEach(borehole => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';

        const excavationDepth = borehole.getExcavationDepth();

        const statusClass = borehole.status === 'complete' ? 'status-ok' :
            borehole.status === 'analyzed' ? 'status-warning' :
            'status-danger';
        const statusText = borehole.status === 'complete' ? '입력완료' :
            borehole.status === 'analyzed' ? '분석완료' :
            '미완료';

        row.innerHTML = `
            <td class="font-medium">${borehole.name}</td>
            <td>(${borehole.location.x}, ${borehole.location.y})</td>
            <td>${borehole.elevation.toFixed(2)}</td>
            <td>${borehole.excavationLevel.toFixed(2)}</td>
            <td>${excavationDepth.toFixed(2)}</td>
            <td>${borehole.getTotalDepth().toFixed(2)}</td>
            <td>${borehole.getLayerCount()}</td>
            <td><span class="${statusClass} px-2 py-1 rounded text-xs">${statusText}</span></td>
            <td>
                <button onclick="editBorehole('${borehole.id}')"
                        class="text-blue-600 hover:text-blue-800 text-sm mr-2">편집</button>
                <button onclick="deleteBorehole('${borehole.id}')"
                        class="text-red-600 hover:text-red-800 text-sm">삭제</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

function editBorehole(id) {
    const borehole = dataStore.boreholes.find(bh => bh.id === id);
    if (!borehole) return;

    dataStore.currentBoreholeId = id;
    const detailDiv = document.getElementById('boreholeDetail');
    const contentDiv = document.getElementById('boreholeDetailContent');

    if (!detailDiv || !contentDiv) {
        return;
    }

    let layersHtml = '';
    borehole.layers.forEach((layer, index) => {
        const paramKey = `${id}_${index}`;
        const params = dataStore.layerParameters[paramKey] || layer.parameters;

        layersHtml += `
            <div class="border border-gray-300 rounded p-4 mb-4" style="border-left: 6px solid ${layer.color}">
                <div class="flex justify-between items-center mb-3">
                    <span class="font-bold text-gray-700">지층 ${index + 1}: ${layer.soilType}</span>
                    ${borehole.layers.length > 1 ?
                        `<button onclick="deleteLayer('${id}', ${index})" class="text-red-500 hover:text-red-700 text-xs">삭제</button>`
                        : ''}
                </div>

                <!-- 기본 정보 -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                    <div>
                        <label class="text-xs text-gray-600">상단심도(m)</label>
                        <input type="number" step="0.01" value="${layer.topDepth}"
                               onchange="updateLayer('${id}', ${index}, 'topDepth', this.value)"
                               class="input-field w-full text-sm">
                    </div>
                    <div>
                        <label class="text-xs text-gray-600">하단심도(m)</label>
                        <input type="number" step="0.01" value="${layer.bottomDepth}"
                               onchange="updateLayer('${id}', ${index}, 'bottomDepth', this.value)"
                               class="input-field w-full text-sm">
                    </div>
                    <div>
                        <label class="text-xs text-gray-600">토질명</label>
                        <input type="text" value="${layer.soilType}"
                               onchange="updateLayer('${id}', ${index}, 'soilType', this.value)"
                               class="input-field w-full text-sm">
                    </div>
                    <div>
                        <label class="text-xs text-gray-600">N값</label>
                        <input type="number" value="${layer.nValue}"
                               onchange="updateLayer('${id}', ${index}, 'nValue', this.value); recalculateParameters('${id}', ${index});"
                               class="input-field w-full text-sm bg-yellow-50">
                    </div>
                    <div>
                        <label class="text-xs text-gray-600">색상</label>
                        <input type="color" value="${layer.color}"
                               onchange="updateLayer('${id}', ${index}, 'color', this.value)"
                               class="w-full h-8 border rounded">
                    </div>
                </div>

                <!-- 지반정수 (AI 추천 + 사용자 수정 가능) -->
                <div class="bg-blue-50 p-3 rounded border border-blue-200">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-blue-900">지반정수 (AI 추천값 - 수정 가능)</span>
                        <button onclick="resetToRecommended('${id}', ${index})"
                                class="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
                            AI 추천값으로 리셋
                        </button>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                            <label class="text-gray-600">φ (°)</label>
                            <input type="number" step="0.1" value="${params.phi}"
                                   onchange="updateParameter('${id}', ${index}, 'phi', this.value)"
                                   class="input-field w-full">
                            <span class="text-gray-500 text-xs">추천: ${layer.parameters.phi}°</span>
                        </div>
                        <div>
                            <label class="text-gray-600">c (kPa)</label>
                            <input type="number" step="0.1" value="${params.c}"
                                   onchange="updateParameter('${id}', ${index}, 'c', this.value)"
                                   class="input-field w-full">
                            <span class="text-gray-500 text-xs">추천: ${layer.parameters.c}</span>
                        </div>
                        <div>
                            <label class="text-gray-600">γ (kN/m³)</label>
                            <input type="number" step="0.1" value="${params.gamma}"
                                   onchange="updateParameter('${id}', ${index}, 'gamma', this.value)"
                                   class="input-field w-full">
                            <span class="text-gray-500 text-xs">건조: ${layer.parameters.gamma}</span>
                        </div>
                        <div>
                            <label class="text-gray-600">γ<sub>sat</sub> (kN/m³)</label>
                            <input type="number" step="0.1" value="${params.gammaSat}"
                                   onchange="updateParameter('${id}', ${index}, 'gammaSat', this.value)"
                                   class="input-field w-full">
                            <span class="text-gray-500 text-xs">포화: ${layer.parameters.gammaSat}</span>
                        </div>
                        <div>
                            <label class="text-gray-600">Em (MPa)</label>
                            <input type="number" step="0.1" value="${params.Em}"
                                   onchange="updateParameter('${id}', ${index}, 'Em', this.value)"
                                   class="input-field w-full">
                        </div>
                        <div>
                            <label class="text-gray-600">Vs (m/s)</label>
                            <input type="number" step="1" value="${params.Vs}"
                                   onchange="updateParameter('${id}', ${index}, 'Vs', this.value)"
                                   class="input-field w-full">
                        </div>
                        <div>
                            <label class="text-gray-600">ν</label>
                            <input type="number" step="0.01" value="${params.poisson}"
                                   onchange="updateParameter('${id}', ${index}, 'poisson', this.value)"
                                   class="input-field w-full">
                        </div>
                        <div>
                            <label class="text-gray-600">Iz</label>
                            <input type="number" step="0.01" value="${params.avgIz}"
                                   onchange="updateParameter('${id}', ${index}, 'avgIz', this.value)"
                                   class="input-field w-full">
                        </div>
                    </div>
                </div>

                <div class="reference-note mt-2">
                    <strong>참고문헌:</strong> Meyerhof(1976), Bowles(1997), 도로교설계기준(2016)
                </div>
            </div>
        `;
    });

    contentDiv.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div>
                <label class="block text-sm text-gray-600 mb-1">시추공 번호</label>
                <input type="text" value="${borehole.name}" class="input-field w-full" readonly>
            </div>
            <div>
                <label class="block text-sm text-gray-600 mb-1">위치 X (m)</label>
                <input type="number" value="${borehole.location.x}"
                       onchange="updateBoreholeLocation('${id}', 'x', this.value)"
                       class="input-field w-full">
            </div>
            <div>
                <label class="block text-sm text-gray-600 mb-1">위치 Y (m)</label>
                <input type="number" value="${borehole.location.y}"
                       onchange="updateBoreholeLocation('${id}', 'y', this.value)"
                       class="input-field w-full">
            </div>
            <div>
                <label class="block text-sm text-gray-600 mb-1">지표 표고 EL.(m)</label>
                <input type="number" step="0.01" value="${borehole.elevation}"
                       onchange="updateBoreholeElevation('${id}', this.value)"
                       class="input-field w-full">
            </div>
            <div>
                <label class="block text-sm text-gray-600 mb-1">굴착 레벨 EL.(m)</label>
                <input type="number" step="0.01" value="${borehole.excavationLevel}"
                       onchange="updateBoreholeExcavation('${id}', this.value)"
                       class="input-field w-full bg-yellow-50">
            </div>
        </div>

        <h4 class="font-semibold text-gray-700 mb-2">지층 정보</h4>
        ${layersHtml}

        <div class="mt-4 flex gap-2">
            <button onclick="addLayerToBorehole('${id}')" class="btn-secondary">
                지층 추가
            </button>
            <button onclick="saveBoreholeChanges('${id}')" class="btn-primary">
                저장
            </button>
        </div>
    `;

    detailDiv.classList.remove('hidden');
}

function updateParameter(boreholeId, layerIndex, param, value) {
    const paramKey = `${boreholeId}_${layerIndex}`;
    if (!dataStore.layerParameters[paramKey]) {
        const borehole = dataStore.boreholes.find(bh => bh.id === boreholeId);
        dataStore.layerParameters[paramKey] = { ...borehole.layers[layerIndex].parameters };
    }
    dataStore.layerParameters[paramKey][param] = parseFloat(value);
}

function resetToRecommended(boreholeId, layerIndex) {
    const borehole = dataStore.boreholes.find(bh => bh.id === boreholeId);
    const layer = borehole.layers[layerIndex];
    const paramKey = `${boreholeId}_${layerIndex}`;
    dataStore.layerParameters[paramKey] = { ...layer.parameters };
    editBorehole(boreholeId);
}

function recalculateParameters(boreholeId, layerIndex) {
    const borehole = dataStore.boreholes.find(bh => bh.id === boreholeId);
    const layer = borehole.layers[layerIndex];
    layer.parameters = layer.calculateRecommendedParameters();
    const paramKey = `${boreholeId}_${layerIndex}`;
    delete dataStore.layerParameters[paramKey];
    editBorehole(boreholeId);
}

function updateLayer(boreholeId, layerIndex, field, value) {
    const borehole = dataStore.boreholes.find(bh => bh.id === boreholeId);
    if (field === 'soilType' || field === 'color') {
        borehole.layers[layerIndex][field] = value;
    } else {
        const parsedValue = parseFloat(value);
        borehole.layers[layerIndex][field] = Number.isFinite(parsedValue) ? parsedValue : 0;
    }
}

function updateBoreholeLocation(id, axis, value) {
    const borehole = dataStore.boreholes.find(bh => bh.id === id);
    const parsedValue = parseFloat(value);
    borehole.location[axis] = Number.isFinite(parsedValue) ? parsedValue : 0;
}

function updateBoreholeElevation(id, value) {
    const borehole = dataStore.boreholes.find(bh => bh.id === id);
    const parsedValue = parseFloat(value);
    borehole.elevation = Number.isFinite(parsedValue) ? parsedValue : 0;
    updateAverageGroundLevel();
}

function updateBoreholeExcavation(id, value) {
    const borehole = dataStore.boreholes.find(bh => bh.id === id);
    const parsedValue = parseFloat(value);
    borehole.excavationLevel = Number.isFinite(parsedValue) ? parsedValue : 0;
}

function addLayerToBorehole(boreholeId) {
    const borehole = dataStore.boreholes.find(bh => bh.id === boreholeId);
    const lastLayer = borehole.layers[borehole.layers.length - 1];
    const newLayer = new SoilLayer(
        lastLayer ? lastLayer.bottomDepth : 0,
        lastLayer ? lastLayer.bottomDepth + 5 : 5,
        '풍화토',
        20
    );
    borehole.addLayer(newLayer);
    editBorehole(boreholeId);
}

function deleteLayer(boreholeId, layerIndex) {
    const borehole = dataStore.boreholes.find(bh => bh.id === boreholeId);
    borehole.layers.splice(layerIndex, 1);
    editBorehole(boreholeId);
}

function addBorehole() {
    const name = prompt('시추공 번호를 입력하세요:');
    if (!name) return;

    const borehole = new Borehole(
        `bh-${Date.now()}`,
        name,
        0,
        0,
        50.0
    );

    dataStore.boreholes.push(borehole);
    renderBoreholeList();
    editBorehole(borehole.id);
}

function deleteBorehole(id) {
    if (!confirm('이 시추공을 삭제하시겠습니까?')) return;

    const index = dataStore.boreholes.findIndex(bh => bh.id === id);
    if (index !== -1) {
        dataStore.boreholes.splice(index, 1);
        renderBoreholeList();
        updateAverageGroundLevel();
    }
}

function saveBoreholeChanges(id) {
    const borehole = dataStore.boreholes.find(bh => bh.id === id);
    if (borehole && borehole.layers.length > 0) {
        borehole.status = 'complete';
        renderBoreholeList();
        alert('저장되었습니다.');
    }
}

// ========================================
// 탭 전환
// ========================================

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    document.querySelectorAll('[id^="tab-"]').forEach(tab => {
        tab.className = tab.className.replace('tab-active', 'tab-inactive');
    });

    const activeContent = document.getElementById(`content-${tabName}`);
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
    }
    if (activeTab) {
        activeTab.className = activeTab.className.replace('tab-inactive', 'tab-active');
    }
}

// ========================================
// 전체 분석 함수
// ========================================

function runAnalysis() {
    const method = document.getElementById('bearingMethod').value;
    const resultsContainer = document.getElementById('analysisResults');
    if (!resultsContainer) {
        return;
    }
    let html = '<h3 class="text-lg font-semibold text-gray-700 mb-4">분석 결과</h3>';

    const analysisResults = [];

    dataStore.boreholes.forEach(borehole => {
        if (borehole.status !== 'incomplete') {
            const Df = parseFloat(document.getElementById('embedmentDepth').value);
            const layerAnalysis = analyzeAndConvertLayers(borehole, Df);

            let bearingResults = [];
            if (method === 'All') {
                bearingResults.push(calculateBearingCapacity(layerAnalysis, 'Terzaghi'));
                bearingResults.push(calculateBearingCapacity(layerAnalysis, 'Meyerhof'));
                bearingResults.push(calculateBearingCapacity(layerAnalysis, 'Hansen'));
            } else {
                const result = calculateBearingCapacity(layerAnalysis, method);
                if (result) {
                    bearingResults.push(result);
                }
            }

            const settlementResult = calculateSettlement(layerAnalysis);

            analysisResults.push({
                borehole: borehole,
                layerAnalysis: layerAnalysis,
                bearingResults: bearingResults,
                settlementResult: settlementResult
            });

            borehole.status = 'analyzed';
        }
    });

    analysisResults.forEach(result => {
        html += `
            <div class="mb-8 border border-gray-300 rounded-lg p-4">
                <h4 class="text-lg font-bold text-gray-700 mb-4">
                    시추공: ${result.borehole.name} (${result.borehole.location.x}, ${result.borehole.location.y})
                </h4>

                <!-- 굴착 정보 -->
                <div class="excavation-highlight mb-4">
                    <h5 class="font-semibold text-yellow-800 mb-2">굴착 레벨 정보</h5>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                        <div>
                            <span class="text-xs text-gray-600">지표고:</span>
                            <span class="font-bold">EL. ${result.layerAnalysis.groundEL.toFixed(2)} m</span>
                        </div>
                        <div>
                            <span class="text-xs text-gray-600">굴착 레벨:</span>
                            <span class="font-bold text-blue-600">EL. ${result.layerAnalysis.excavationEL.toFixed(2)} m</span>
                        </div>
                        <div>
                            <span class="text-xs text-gray-600">굴착 깊이:</span>
                            <span class="font-bold">${result.layerAnalysis.excavationDepth.toFixed(2)} m</span>
                        </div>
                        <div>
                            <span class="text-xs text-gray-600">기초 근입:</span>
                            <span class="font-bold">${result.layerAnalysis.Df.toFixed(2)} m</span>
                        </div>
                        <div>
                            <span class="text-xs text-gray-600">기초 저면:</span>
                            <span class="font-bold text-red-600">EL. ${result.layerAnalysis.foundationBottomEL.toFixed(2)} m</span>
                        </div>
                    </div>
                </div>

                <!-- 지층 분석 결과 -->
                <div class="mb-4">
                    <h5 class="font-semibold text-gray-600 mb-2">지층 분석</h5>
                    <table class="w-full text-xs">
                        <thead>
                            <tr>
                                <th>지층</th>
                                <th>두께(m)</th>
                                <th>N값</th>
                                <th>φ(°)</th>
                                <th>c(kPa)</th>
                                <th>γ'(kN/m³)</th>
                                <th>Em(MPa)</th>
                                <th>표고 범위 (EL.m)</th>
                            </tr>
                        </thead>
                        <tbody>`;

        result.layerAnalysis.effectiveLayers.forEach((layer, idx) => {
            const isBearing = idx === 0;
            html += `
                <tr class="${isBearing ? 'bg-yellow-50 font-bold' : ''}">
                    <td>${layer.soilType}${isBearing ? ' (지지층)' : ''}</td>
                    <td>${layer.thickness.toFixed(2)}</td>
                    <td>${layer.Nvalue}</td>
                    <td>${layer.phi}</td>
                    <td>${layer.c}</td>
                    <td>${layer.effectiveGamma.toFixed(2)}</td>
                    <td>${layer.Em}</td>
                    <td>${layer.topElevation} ~ ${layer.bottomElevation}</td>
                </tr>`;
        });

        html += `</tbody></table></div>`;

        html += `<div class="mb-4">
            <h5 class="font-semibold text-gray-600 mb-2">지지력 계산 결과</h5>
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th>방법</th>
                        <th>qult (kN/m²)</th>
                        <th>qa (kN/m²)</th>
                        <th>실제 FS</th>
                        <th>판정</th>
                    </tr>
                </thead>
                <tbody>`;

        result.bearingResults.forEach(br => {
            html += `
                <tr>
                    <td>${br.method}</td>
                    <td>${br.qult}</td>
                    <td class="font-bold">${br.qa}</td>
                    <td>${br.actualSF}</td>
                    <td>
                        <span class="${br.isCheck ? 'status-ok' : 'status-danger'} px-2 py-1 rounded text-xs">
                            ${br.isCheck ? 'OK' : 'NG'}
                        </span>
                    </td>
                </tr>`;

            if (br.method === 'Terzaghi') {
                html += `
                    <tr>
                        <td colspan="5" class="text-xs p-2 bg-gray-50">
                            <div class="calculation-step">
                                <strong>Terzaghi 계산 (굴착면 기준):</strong><br/>
                                qult = α·c·Nc + γ'·Df·Nq + β·γ·B·Nγ<br/>
                                = ${br.alpha}×${br.c}×${br.Nc} + ${br.gammaSurcharge}×${br.Df}×${br.Nq} +
                                ${br.beta}×${br.gamma}×B×${br.Ngamma}<br/>
                                = ${br.term1} + ${br.term2} + ${br.term3} = ${br.qult} kN/m²<br/>
                                <span class="text-blue-600">※ Df는 굴착면에서 기초 저면까지 깊이</span>
                            </div>
                        </td>
                    </tr>`;
            }
        });

        html += `</tbody></table></div>`;

        const sr = result.settlementResult;
        html += `
            <div class="mb-4">
                <h5 class="font-semibold text-gray-600 mb-2">침하량 계산 결과 (Schmertmann)</h5>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div class="bg-gray-50 p-2 rounded">
                        <span class="text-xs text-gray-600">C₁:</span>
                        <span class="font-bold">${sr.C1}</span>
                    </div>
                    <div class="bg-gray-50 p-2 rounded">
                        <span class="text-xs text-gray-600">C₂:</span>
                        <span class="font-bold">${sr.C2}</span>
                    </div>
                    <div class="bg-gray-50 p-2 rounded">
                        <span class="text-xs text-gray-600">예상침하량:</span>
                        <span class="font-bold">${sr.settlement} mm</span>
                    </div>
                    <div class="${sr.isOK ? 'bg-green-100' : 'bg-red-100'} p-2 rounded">
                        <span class="text-xs text-gray-600">판정:</span>
                        <span class="font-bold ${sr.isOK ? 'text-green-700' : 'text-red-700'}">
                            ${sr.isOK ? 'OK' : 'NG'}
                        </span>
                    </div>
                </div>
                <div class="calculation-step mt-2">
                    S = C₁×C₂×ΔP×Σ(Iz/Em×Δz) = ${sr.C1}×${sr.C2}×${sr.deltaP_MPa}×${sr.sumIzOverEm_Dz} = ${sr.settlement} mm
                </div>
            </div>
        `;

        html += `</div>`;
    });

    if (analysisResults.length > 0) {
        const qaValues = analysisResults.flatMap(r => r.bearingResults.map(br => parseFloat(br.qa)));
        const settlementValues = analysisResults.map(r => parseFloat(r.settlementResult.settlement));
        const minBearing = Math.min(...qaValues);
        const maxBearing = Math.max(...qaValues);
        const avgBearing = qaValues.reduce((a, b) => a + b, 0) / qaValues.length;
        const minSettlement = Math.min(...settlementValues);
        const maxSettlement = Math.max(...settlementValues);
        const avgSettlement = settlementValues.reduce((a, b) => a + b, 0) / settlementValues.length;

        html = `
            <div class="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-300">
                <h3 class="text-lg font-bold text-gray-700 mb-4">종합 분석 요약</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">허용지지력 범위</p>
                        <p class="text-lg font-bold">${minBearing.toFixed(1)} ~ ${maxBearing.toFixed(1)} kN/m²</p>
                        <p class="text-xs text-gray-500">평균: ${avgBearing.toFixed(1)} kN/m²</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">예상침하량 범위</p>
                        <p class="text-lg font-bold">${minSettlement.toFixed(1)} ~ ${maxSettlement.toFixed(1)} mm</p>
                        <p class="text-xs text-gray-500">평균: ${avgSettlement.toFixed(1)} mm</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">설계 권장값</p>
                        <p class="text-lg font-bold text-red-600">qa = ${minBearing.toFixed(1)} kN/m²</p>
                        <p class="text-xs text-gray-500">(최소값 적용 - 보수적 설계)</p>
                    </div>
                </div>
                <div class="mt-4 p-3 bg-yellow-100 rounded">
                    <p class="text-sm text-yellow-800">
                        <strong>⚠️ 중요:</strong> 모든 계산은 굴착 레벨 EL. ${dataStore.plannedExcavationLevel.toFixed(2)} m를 기준으로 수행되었습니다.
                    </p>
                </div>
            </div>
        ` + html;
    }

    resultsContainer.innerHTML = html;
    resultsContainer.classList.remove('hidden');

    renderBoreholeList();

    updateComparisonTab(analysisResults);
}

function updateComparisonTab(analysisResults) {
    const container = document.getElementById('comparisonContent');

    if (!container) {
        return;
    }

    if (analysisResults.length === 0) {
        container.innerHTML = '<p class="text-gray-500">분석을 먼저 실행해주세요.</p>';
        return;
    }

    let html = `
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead>
                    <tr>
                        <th rowspan="2">시추공</th>
                        <th rowspan="2">위치</th>
                        <th rowspan="2">지표고<br/>(EL.m)</th>
                        <th rowspan="2">굴착레벨<br/>(EL.m)</th>
                        <th rowspan="2">지지층</th>
                        <th colspan="3">허용지지력 (kN/m²)</th>
                        <th rowspan="2">침하량<br/>(mm)</th>
                        <th rowspan="2">종합판정</th>
                    </tr>
                    <tr>
                        <th class="text-xs">Terzaghi</th>
                        <th class="text-xs">Meyerhof</th>
                        <th class="text-xs">Hansen</th>
                    </tr>
                </thead>
                <tbody>`;

    analysisResults.forEach(result => {
        const bearingLayer = result.layerAnalysis.bearingLayer;
        const terzaghi = result.bearingResults.find(r => r.method === 'Terzaghi');
        const meyerhof = result.bearingResults.find(r => r.method === 'Meyerhof');
        const hansen = result.bearingResults.find(r => r.method === 'Hansen');

        const allOk = result.bearingResults.every(br => br.isCheck) && result.settlementResult.isOK;

        html += `
            <tr>
                <td class="font-medium">${result.borehole.name}</td>
                <td>(${result.borehole.location.x}, ${result.borehole.location.y})</td>
                <td>${result.borehole.elevation.toFixed(2)}</td>
                <td>${result.borehole.excavationLevel.toFixed(2)}</td>
                <td>${bearingLayer.soilType}</td>
                <td class="${terzaghi && terzaghi.isCheck ? 'text-green-600' : 'text-red-600'}">
                    ${terzaghi ? terzaghi.qa : '-'}
                </td>
                <td class="${meyerhof && meyerhof.isCheck ? 'text-green-600' : 'text-red-600'}">
                    ${meyerhof ? meyerhof.qa : '-'}
                </td>
                <td class="${hansen && hansen.isCheck ? 'text-green-600' : 'text-red-600'}">
                    ${hansen ? hansen.qa : '-'}
                </td>
                <td class="${result.settlementResult.isOK ? 'text-green-600' : 'text-red-600'}">
                    ${result.settlementResult.settlement}
                </td>
                <td>
                    <span class="${allOk ? 'status-ok' : 'status-danger'} px-2 py-1 rounded text-xs">
                        ${allOk ? '적합' : '부적합'}
                    </span>
                </td>
            </tr>`;
    });

    html += '</tbody></table></div>';

    container.innerHTML = html;
}

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeSystem();
    const embedmentDepthInput = document.getElementById('embedmentDepth');
    if (embedmentDepthInput) {
        embedmentDepthInput.addEventListener('input', updateExcavationInfo);
    }
});

// 전역에서 접근할 수 있도록 노출
Object.assign(window, {
    switchTab,
    addBorehole,
    editBorehole,
    deleteBorehole,
    addLayerToBorehole,
    saveBoreholeChanges,
    updateLayer,
    updateParameter,
    resetToRecommended,
    recalculateParameters,
    updateBoreholeLocation,
    updateBoreholeElevation,
    updateBoreholeExcavation,
    deleteLayer,
    runAnalysis,
    updateExcavationInfo
});
