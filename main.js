import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

function slugify(str) {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

async function baixarPagina(url) {
    console.log(`⬇ Baixando: ${url}`);
    const resp = await fetch(url);
    const html = await resp.text();
    return html;
}

async function processarCurso(nomeCurso, urlCurso, pastaData) {
    try {
        const slug = slugify(nomeCurso);
        const pastaCurso = path.join(pastaData, slug);
        fs.mkdirSync(pastaCurso, { recursive: true });

        const html = await baixarPagina(urlCurso);

        const $ = cheerio.load(html);
        let novosProfessores = [];

        $(".accordion.teacher").each((i, el) => {
            const nome = $(el).find(".accordion__title a").text().trim();
            const link = $(el).find("a.curriculum-lattes").attr("href") || null;

            if (nome && link) {
                novosProfessores.push({
                    nome,
                    curriculo: link,
                    htmlCurriculo: ""
                });
            }
        });

        console.log(`📋 Curso ${nomeCurso}: encontrados ${novosProfessores.length} professores.`);

        const outputFile = path.join(pastaCurso, "professores.json");

        let professoresExistentes = [];
        if (fs.existsSync(outputFile)) {
            professoresExistentes = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
        }

        const mapa = new Map();
        for (const prof of professoresExistentes) {
            mapa.set(prof.nome.toLowerCase(), prof);
        }

        // Adicionar apenas os novos professores
        const novosNaoDuplicados = novosProfessores.filter(
            (prof) => !mapa.has(prof.nome.toLowerCase())
        );

        // 🚀 Baixar todos os novos professores em paralelo
        await Promise.all(
            novosNaoDuplicados.map(async (prof) => {
                try {
                    console.log(`⬇ Baixando currículo de ${prof.nome}...`);
                    const pageResp = await fetch(prof.curriculo);
                    const pageHtml = await pageResp.text();

                    const $page = cheerio.load(pageHtml);
                    let textoLimpo = $page("body").text()
                        .replace(/\s+/g, " ")
                        .trim()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "");

                    prof.htmlCurriculo = textoLimpo;

                    mapa.set(prof.nome.toLowerCase(), prof);
                } catch (err) {
                    console.error(`❌ Erro ao processar ${prof.nome}:`, err.message);
                }
            })
        );

        // Ordenar alfabeticamente
        const listaFinal = Array.from(mapa.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
        );

        // Salvar
        fs.writeFileSync(outputFile, JSON.stringify(listaFinal, null, 2), "utf-8");
        console.log(`💾 Arquivo salvo: ${outputFile} (${listaFinal.length} professores)`);
    } catch (err) {
        console.error(`❌ Erro no curso ${nomeCurso}:`, err.message);
    }
}

async function main() {
    const pastaData = path.join(process.cwd(), "data");
    fs.mkdirSync(pastaData, { recursive: true });

    // 1. Baixar listagem de cursos
    const urlLista = "https://unifor.br/web/graduacao/todos-os-cursos";
    const fileLista = path.join(pastaData, "lista_cursos.html");
    const htmlLista = await baixarPagina(urlLista, fileLista);

    // 2. Extrair cursos
    const $ = cheerio.load(htmlLista);
    let cursos = [];

    $(".cards.cards--course .card.card--shadow").each((i, el) => {
        const nome = $(el).find("h3.card__title-course a").text().trim();
        let href = $(el).find("h3.card__title-course a").attr("href");
        if (href && !href.startsWith("http")) {
            href = "https://unifor.br" + href;
        }
        if (nome && href) {
            cursos.push({ nome, url: href, slug: slugify(nome) });
        }
    });

    console.log(`📚 Encontrados ${cursos.length} cursos.`);

    // 💾 Salvar cursos.json
    const cursosFile = path.join(pastaData, "cursos.json");
    fs.writeFileSync(cursosFile, JSON.stringify(cursos, null, 2), "utf-8");
    console.log(`💾 Lista de cursos salva em ${cursosFile}`);

    // 3. Processar cada curso
    for (const curso of cursos) {
        await processarCurso(curso.nome, curso.url, pastaData);
    }
}

main();

