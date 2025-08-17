import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

async function baixarPagina(url) {
    console.log(`⬇ Baixando: ${url}`);
    const resp = await fetch(url);
    const html = await resp.text();
    return html;
}

async function processarCurso(slugCurso, urlCurso, pastaData) {
    try {
        const pastaCurso = path.join(pastaData, slugCurso);
        fs.mkdirSync(pastaCurso, { recursive: true });

        const filePrincipal = path.join(pastaCurso, "pagina_principal.html");
        const html = await baixarPagina(urlCurso, filePrincipal);

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

        console.log(`📋 Curso ${slugCurso}: encontrados ${novosProfessores.length} professores.`);

        const outputFile = path.join(pastaCurso, "professores.json");

        let professoresExistentes = [];
        if (fs.existsSync(outputFile)) {
            professoresExistentes = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
        }

        const mapa = new Map();
        for (const prof of professoresExistentes) {
            mapa.set(prof.nome.toLowerCase(), prof);
        }

        for (const prof of novosProfessores) {
            if (!mapa.has(prof.nome.toLowerCase())) {
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
            }
        }

        const listaFinal = Array.from(mapa.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
        );

        fs.writeFileSync(outputFile, JSON.stringify(listaFinal, null, 2), "utf-8");
        console.log(`💾 Arquivo salvo: ${outputFile} (${listaFinal.length} professores)`);
    } catch (err) {
        console.error(`❌ Erro no curso ${nomeCurso}:`, err.message);
    }
}

async function main() {
    const pastaData = path.join(process.cwd(), "data");
    fs.mkdirSync(pastaData, { recursive: true });

    const urlLista = "https://unifor.br/web/graduacao/todos-os-cursos";
    const fileLista = path.join(pastaData, "lista_cursos.html");
    const htmlLista = await baixarPagina(urlLista, fileLista);

    const $ = cheerio.load(htmlLista);
    let cursos = [];
    const vistos = new Set();

    $(".cards.cards--course .card.card--shadow").each((i, el) => {
        const nome = $(el).find("h3.card__title-course a").text().trim();
        let href = $(el).find("h3.card__title-course a").attr("href");
        if (href && !href.startsWith("http")) {
            href = "https://unifor.br" + href;
        }

        if (nome && href) {
            const slug = href.split("/").filter(Boolean).pop();

            if (!vistos.has(slug)) {
                cursos.push({ nome, url: href, slug, slug: slug });
                vistos.add(slug);
            }
        }
    });

    cursos.sort((a, b) => a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" }));

    console.log(`📚 Encontrados ${cursos.length} cursos.`);

    const cursosFile = path.join(pastaData, "cursos.json");
    fs.writeFileSync(cursosFile, JSON.stringify(cursos, null, 2), "utf-8");
    console.log(`💾 Lista de cursos salva em ${cursosFile}`);

    for (const curso of cursos) {
        await processarCurso(curso.slug, curso.url, pastaData);
    }
}

main();

