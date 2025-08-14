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

const curso = process.argv[2];
if (!curso) {
    console.error("❌ Informe o curso: node scraper.js ciencia-da-computacao");
    process.exit(1);
}

async function main() {
    try {
        const pastaData = path.join(process.cwd(), "data");
        const pastaCurso = path.join(pastaData, slugify(curso));

        fs.mkdirSync(pastaCurso, { recursive: true });

        const filePrincipal = path.join(pastaCurso, "pagina_principal.html");

        let html;
        if (fs.existsSync(filePrincipal)) {
            console.log(`📂 Usando cache da página principal (${curso})`);
            html = fs.readFileSync(filePrincipal, "utf-8");
        } else {
            const url = `https://unifor.br/web/graduacao/${curso}`;
            console.log(`⬇ Baixando página principal: ${url}`);
            const resp = await fetch(url);
            html = await resp.text();
            fs.writeFileSync(filePrincipal, html, "utf-8");
        }

        const $ = cheerio.load(html);
        let professores = [];

        $(".accordion.teacher").each((i, el) => {
            const nome = $(el).find(".accordion__title a").text().trim();
            const link = $(el).find("a.curriculum-lattes").attr("href") || null;

            if (link) {
                professores.push({
                    nome,
                    curriculo: link,
                    htmlCurriculo: ""
                });
            }
        });

        console.log(`📋 Encontrados ${professores.length} professores.`);

        for (let prof of professores) {
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
            } catch (err) {
                console.error(`❌ Erro ao processar ${prof.nome}:`, err.message);
            }
        }

        const outputFile = path.join(pastaCurso, "professores_keywords.json");
        fs.writeFileSync(outputFile, JSON.stringify(professores, null, 2), "utf-8");
        console.log(`💾 Arquivo salvo: ${outputFile}`);
    } catch (error) {
        console.error("❌ Erro geral:", error);
    }
}

main();

