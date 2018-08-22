// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import * as Ajv from "ajv";

import { Publication } from "@models/publication";
import {
    getAllMediaOverlays,
    mediaOverlayURLParam,
    mediaOverlayURLPath,
} from "@parser/epub";
import { encodeURIComponent_RFC3986, isHTTP } from "@utils/http/UrlUtils";
import { sortObject, traverseJsonObjects } from "@utils/JsonUtils";
import * as css2json from "css2json";
import * as debug_ from "debug";
import * as express from "express";
import * as jsonMarkup from "json-markup";
import { JSON as TAJSON } from "ta-json";

import {
    IRequestPayloadExtension,
    IRequestQueryParams,
    _jsonPath,
    _pathBase64,
    _show,
} from "./request-ext";
import { Server } from "./server";

const debug = debug_("r2:streamer#http/server-manifestjson");

let _jsonSchemas: any[] | undefined;

function webPubManifestJsonValidate(jsonToValidate: any): string | undefined {
    try {
        // tslint:disable-next-line:max-line-length
        // "^((?<grandfathered>(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)|(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang))|((?<language>([A-Za-z]{2,3}(-(?<extlang>[A-Za-z]{3}(-[A-Za-z]{3}){0,2}))?)|[A-Za-z]{4}|[A-Za-z]{5,8})(-(?<script>[A-Za-z]{4}))?(-(?<region>[A-Za-z]{2}|[0-9]{3}))?(-(?<variant>[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*(-(?<extension>[0-9A-WY-Za-wy-z](-[A-Za-z0-9]{2,8})+))*(-(?<privateUse>x(-[A-Za-z0-9]{1,8})+))?)|(?<privateUse2>x(-[A-Za-z0-9]{1,8})+))$"
        // https://github.com/sebinsua/ietf-language-tag-regex
        // tslint:disable-next-line:max-line-length
        // https://stackoverflow.com/questions/7035825/regular-expression-for-a-language-tag-as-defined-by-bcp47/7036171#7036171
        //
        // https://regex101.com
        // PCRE PHP okay, but fail with others (JAVASCRIPT, PYTHON, GO)
        // because of named capturing groups (e.g. ?<grandfathered>)
        // => simply remove for Javascript RegExp,
        // or optionally call ajv.addFormat() with https://github.com/slevithan/xregexp "regexp" replacement?
        //
        // const regular = "(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang)";
        // tslint:disable-next-line:max-line-length
        // const irregular = "(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)";
        // const grandfathered = "(?<grandfathered>" + irregular + "|" + regular + ")";
        // const privateUse = "(?<privateUse>x(-[A-Za-z0-9]{1,8})+)";
        // const privateUse2 = "(?<privateUse2>x(-[A-Za-z0-9]{1,8})+)";
        // const singleton = "[0-9A-WY-Za-wy-z]";
        // const extension = "(?<extension>" + singleton + "(-[A-Za-z0-9]{2,8})+)";
        // const variant = "(?<variant>[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3})";
        // const region = "(?<region>[A-Za-z]{2}|[0-9]{3})";
        // const script = "(?<script>[A-Za-z]{4})";
        // const extlang = "(?<extlang>[A-Za-z]{3}(-[A-Za-z]{3}){0,2})";
        // const language = "(?<language>([A-Za-z]{2,3}(-" + extlang + ")?)|[A-Za-z]{4}|[A-Za-z]{5,8})";
        // tslint:disable-next-line:max-line-length
        // const langtag = "(" + language + "(-" + script + ")?" + "(-" + region + ")?" + "(-" + variant + ")*" + "(-" + extension + ")*" + "(-" + privateUse + ")?" + ")";
        // const languageTag = "(" + grandfathered + "|" + langtag + "|" + privateUse2 + ")";
        // // const bcp47RegEx = languageTag + "g";
        // const bcp47RegEx = "^" + languageTag + "$";
        // debug(bcp47RegEx);

        debug("WebPub Manifest JSON Schema validation ...");

        if (!_jsonSchemas) {
            const jsonSchemasRootpath = path.join(process.cwd(), "misc/json-schema");
            const jsonSchemasNames = [
                "publication", // must be first!
                "contributor-object",
                "contributor",
                "link",
                "metadata",
                "subcollection",
            ];

            for (const jsonSchemaName of jsonSchemasNames) {
                const jsonSchemaPath = path.join(jsonSchemasRootpath, jsonSchemaName + ".schema.json");
                debug(jsonSchemaPath);
                if (!fs.existsSync(jsonSchemaPath)) {
                    debug("Skipping JSON SCHEMAS (not found): " + jsonSchemaPath);
                    return undefined;
                }
                let jsonSchemaStr = fs.readFileSync(jsonSchemaPath, { encoding: "utf8" });
                if (!jsonSchemaStr) {
                    debug("File load fail: " + jsonSchemaPath);
                    return undefined;
                }
                jsonSchemaStr = jsonSchemaStr.replace(/\?<grandfathered>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<privateUse>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<privateUse2>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<extension>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<variant>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<script>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<extlang>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<language>/g, "");
                jsonSchemaStr = jsonSchemaStr.replace(/\?<region>/g, "");
                // debug(jsonSchemaStr);
                if (jsonSchemaStr.indexOf("?<") >= 0) {
                    debug("REGEX WARNING!!");
                    // process.exit(-1);
                    return undefined;
                }
                const jsonSchema = global.JSON.parse(jsonSchemaStr);
                if (!_jsonSchemas) {
                    _jsonSchemas = [];
                }
                _jsonSchemas.push(jsonSchema);
                // debug(jsonSchema);
            }
        }
        if (!_jsonSchemas) {
            return undefined;
        }

        const ajv = new Ajv({ allErrors: true, coerceTypes: false, verbose: true });

        // const ajvValidate = ajv.compile({});
        // const ajvValid = ajvValidate(jsonObj);
        // if (!ajvValid) {
        //     debug(ajvValidate.errors);
        // }

        _jsonSchemas.forEach((jsonSchema) => {
            // tslint:disable-next-line:no-string-literal
            debug("JSON Schema ADD: " + jsonSchema["$id"]);
            // tslint:disable-next-line:no-string-literal
            ajv.addSchema(jsonSchema, jsonSchema["$id"]); // returns 'ajv' for chaining
        });

        // debug(jsonToValidate);
        debug("JSON Schema VALIDATE ...");

        // tslint:disable-next-line:no-string-literal
        const ajvValid = ajv.validate(_jsonSchemas[0]["$id"], jsonToValidate);
        if (!ajvValid) {
            debug("WebPub Manifest JSON Schema validation FAIL.");
            const errorsText = ajv.errorsText();
            debug(errorsText);
            return errorsText;
        } else {
            debug("WebPub Manifest JSON Schema validation OK.");
        }
    } catch (err) {
        debug("JSON Schema VALIDATION PROBLEM.");
        debug(err);
        return err;
    }

    return undefined;
}

export function serverManifestJson(server: Server, routerPathBase64: express.Router) {

    // https://github.com/mafintosh/json-markup/blob/master/style.css
    const jsonStyle = `
.json-markup {
    line-height: 17px;
    font-size: 13px;
    font-family: monospace;
    white-space: pre;
}
.json-markup-key {
    font-weight: bold;
}
.json-markup-bool {
    color: firebrick;
}
.json-markup-string {
    color: green;
}
.json-markup-null {
    color: gray;
}
.json-markup-number {
    color: blue;
}
`;

    const routerManifestJson = express.Router({ strict: false });
    // routerManifestJson.use(morgan("combined", { stream: { write: (msg: any) => debug(msg) } }));

    routerManifestJson.get(["/", "/" + _show + "/:" + _jsonPath + "?"],
        async (req: express.Request, res: express.Response) => {

            const reqparams = req.params as IRequestPayloadExtension;

            if (!reqparams.pathBase64) {
                reqparams.pathBase64 = (req as IRequestPayloadExtension).pathBase64;
            }
            if (!reqparams.lcpPass64) {
                reqparams.lcpPass64 = (req as IRequestPayloadExtension).lcpPass64;
            }

            const isShow = req.url.indexOf("/show") >= 0 || (req.query as IRequestQueryParams).show;
            if (!reqparams.jsonPath && (req.query as IRequestQueryParams).show) {
                reqparams.jsonPath = (req.query as IRequestQueryParams).show;
            }

            // debug(req.method);
            const isHead = req.method.toLowerCase() === "head";
            if (isHead) {
                debug("HEAD !!!!!!!!!!!!!!!!!!!");
            }

            const isCanonical = (req.query as IRequestQueryParams).canonical &&
                (req.query as IRequestQueryParams).canonical === "true";

            const isSecureHttp = req.secure ||
                req.protocol === "https" ||
                req.get("X-Forwarded-Proto") === "https"
                // (req.headers.host && req.headers.host.indexOf("now.sh") >= 0) ||
                // (req.hostname && req.hostname.indexOf("now.sh") >= 0)
                ;

            const pathBase64Str = new Buffer(reqparams.pathBase64, "base64").toString("utf8");

            // const fileName = path.basename(pathBase64Str);
            // const ext = path.extname(fileName).toLowerCase();

            let publication: Publication;
            try {
                publication = await server.loadOrGetCachedPublication(pathBase64Str);
            } catch (err) {
                debug(err);
                res.status(500).send("<html><body><p>Internal Server Error</p><p>"
                    + err + "</p></body></html>");
                return;
            }

            // dumpPublication(publication);

            if (reqparams.lcpPass64 && !server.disableDecryption) {
                const lcpPass = new Buffer(reqparams.lcpPass64, "base64").toString("utf8");
                if (publication.LCP) {
                    try {
                        await publication.LCP.tryUserKeys([lcpPass]); // hex
                    } catch (err) {
                        debug(err);
                        const errMsg = "FAIL publication.LCP.tryUserKeys(): " + err;
                        debug(errMsg);
                        res.status(500).send("<html><body><p>Internal Server Error</p><p>"
                            + errMsg + "</p></body></html>");
                        return;
                    }
                }
            }

            // debug(req.url); // path local to this router
            // debug(req.baseUrl); // path local to above this router
            // debug(req.originalUrl); // full path (req.baseUrl + req.url)
            // url.parse(req.originalUrl, false).host
            // req.headers.host has port, not req.hostname

            const rootUrl = (isSecureHttp ? "https://" : "http://")
                + req.headers.host + "/pub/"
                + (reqparams.lcpPass64 ?
                    (server.lcpBeginToken + encodeURIComponent_RFC3986(reqparams.lcpPass64) + server.lcpEndToken) :
                    "")
                + encodeURIComponent_RFC3986(reqparams.pathBase64);
            const manifestURL = rootUrl + "/" + "manifest.json";

            const selfLink = publication.searchLinkByRel("self");
            if (!selfLink) {
                publication.AddLink("application/webpub+json", ["self"], manifestURL, false);
            }

            function absoluteURL(href: string): string {
                return rootUrl + "/" + href;
            }

            function absolutizeURLs(jsonObj: any) {
                traverseJsonObjects(jsonObj,
                    (obj) => {
                        if (obj.href && typeof obj.href === "string"
                            && !isHTTP(obj.href)) {
                            // obj.href_ = obj.href;
                            obj.href = absoluteURL(obj.href);
                        }

                        if (obj["media-overlay"] && typeof obj["media-overlay"] === "string"
                            && !isHTTP(obj["media-overlay"])) {
                            // obj["media-overlay_"] = obj["media-overlay"];
                            obj["media-overlay"] = absoluteURL(obj["media-overlay"]);
                        }
                    });
            }

            let hasMO = false;
            if (publication.Spine) {
                const link = publication.Spine.find((l) => {
                    if (l.Properties && l.Properties.MediaOverlay) {
                        return true;
                    }
                    return false;
                });
                if (link) {
                    hasMO = true;
                }
            }
            if (hasMO) {
                const moLink = publication.searchLinkByRel("media-overlay");
                if (!moLink) {
                    const moURL = // rootUrl + "/" +
                        mediaOverlayURLPath +
                        "?" + mediaOverlayURLParam + "={path}";
                    publication.AddLink("application/vnd.readium.mo+json", ["media-overlay"], moURL, true);
                }
            }

            let coverImage: string | undefined;
            const coverLink = publication.GetCover();
            if (coverLink) {
                coverImage = coverLink.Href;
                if (coverImage && !isHTTP(coverImage)) {
                    coverImage = absoluteURL(coverImage);
                }
            }

            if (isShow) {
                let objToSerialize: any = null;

                if (reqparams.jsonPath) {
                    switch (reqparams.jsonPath) {

                        case "all": {
                            objToSerialize = publication;
                            break;
                        }
                        case "cover": {
                            objToSerialize = publication.GetCover();
                            break;
                        }
                        case "mediaoverlays": {
                            try {
                                objToSerialize = await getAllMediaOverlays(publication);
                            } catch (err) {
                                debug(err);
                                res.status(500).send("<html><body><p>Internal Server Error</p><p>"
                                    + err + "</p></body></html>");
                                return;
                            }
                            break;
                        }
                        case "spine": {
                            objToSerialize = publication.Spine;
                            break;
                        }
                        case "pagelist": {
                            objToSerialize = publication.PageList;
                            break;
                        }
                        case "landmarks": {
                            objToSerialize = publication.Landmarks;
                            break;
                        }
                        case "links": {
                            objToSerialize = publication.Links;
                            break;
                        }
                        case "resources": {
                            objToSerialize = publication.Resources;
                            break;
                        }
                        case "toc": {
                            objToSerialize = publication.TOC;
                            break;
                        }
                        case "metadata": {
                            objToSerialize = publication.Metadata;
                            break;
                        }
                        default: {
                            objToSerialize = null;
                        }
                    }
                } else {
                    objToSerialize = publication;
                }

                if (!objToSerialize) {
                    objToSerialize = {};
                }

                const jsonObj = TAJSON.serialize(objToSerialize);

                let validationStr: string | undefined;
                if (!reqparams.jsonPath || reqparams.jsonPath === "all") {

                    // // tslint:disable-next-line:no-string-literal
                    // if (jsonObj["@context"] && typeof jsonObj["@context"] === "string") {
                    //     jsonObj["@context"] = [ jsonObj["@context"] ];
                    // }

                    // // tslint:disable-next-line:no-string-literal
                    // jsonObj["@context"] = jsonObj["@context"][0];

                    validationStr = webPubManifestJsonValidate(jsonObj);
                }

                absolutizeURLs(jsonObj);

                // const jsonStr = global.JSON.stringify(jsonObj, null, "    ");

                // // breakLength: 100  maxArrayLength: undefined
                // const dumpStr = util.inspect(objToSerialize,
                //     { showHidden: false, depth: 1000, colors: false, customInspect: true });

                const jsonPretty = jsonMarkup(jsonObj, css2json(jsonStyle));

                res.status(200).send("<html>" +
                    "<head><script type=\"application/ld+json\" href=\"" +
                    manifestURL +
                    "\"></script></head>" +
                    "<body>" +
                    "<h1>" + path.basename(pathBase64Str) + "</h1>" +
                    (coverImage ? "<img src=\"" + coverImage + "\" alt=\"\"/>" : "") +
                    "<hr><p><pre>" + jsonPretty + "</pre></p>" +
                    (validationStr ? ("<hr><p><pre>" + validationStr + "</pre></p>") : ("<hr><p>JSON SCHEMA OK.</p>")) +
                    // "<hr><p><pre>" + jsonStr + "</pre></p>" +
                    // "<p><pre>" + dumpStr + "</pre></p>" +
                    "</body></html>");
            } else {
                server.setResponseCORS(res);
                res.set("Content-Type", "application/webpub+json; charset=utf-8");

                const publicationJsonObj = TAJSON.serialize(publication);

                // absolutizeURLs(publicationJsonObj);

                if (isCanonical) {
                    if (publicationJsonObj.links) {
                        delete publicationJsonObj.links;
                    }
                }

                const publicationJsonStr = isCanonical ?
                    global.JSON.stringify(sortObject(publicationJsonObj), null, "") :
                    global.JSON.stringify(publicationJsonObj, null, "  ");

                const checkSum = crypto.createHash("sha256");
                checkSum.update(publicationJsonStr);
                const hash = checkSum.digest("hex");

                const match = req.header("If-None-Match");
                if (match === hash) {
                    debug("manifest.json cache");
                    res.status(304); // StatusNotModified
                    res.end();
                    return;
                }

                res.setHeader("ETag", hash);
                // res.setHeader("Cache-Control", "public,max-age=86400");

                const links = publication.GetPreFetchResources();
                if (links && links.length) {
                    let prefetch = "";
                    links.forEach((l) => {
                        const href = absoluteURL(l.Href);
                        prefetch += "<" + href + ">;" + "rel=prefetch,";
                    });

                    res.setHeader("Link", prefetch);
                }

                res.status(200);

                if (isHead) {
                    res.end();
                } else {
                    res.send(publicationJsonStr);
                }
            }
        });

    routerPathBase64.use("/:" + _pathBase64 + "/manifest.json", routerManifestJson);
}
