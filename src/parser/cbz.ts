import * as mime from "mime-types";
import * as path from "path";
import * as slugify from "slugify";
import * as xmldom from "xmldom";

import { XML } from "../xml-js-mapper";

import { ComicInfo } from "./comicrack/comicrack";

import { createZipPromise } from "./zip";

import { Link } from "../models/publication-link";

import { Metadata } from "../models/metadata";

import { Publication } from "../models/publication";

import { Contributor } from "../models/metadata-contributor";

export class CbzParser {

    public Parse(filePath: string): Promise<Publication> {

        const zipPromise = createZipPromise(filePath);

        return zipPromise
            .then((zip: any) => {
                return this.createPublicationPromise(filePath, zip);
            });
    }

    private createPublicationPromise(filePath: string, zip: any): Promise<Publication> {

        return new Promise<Publication>((resolve, reject) => {

            if (!zip.entriesCount) {
                reject();
            }

            const publication = new Publication();
            publication.Metadata = new Metadata();
            publication.Metadata.Identifier = this.filePathToTitle(filePath);

            publication.AddToInternal("type", "cbz");
            publication.AddToInternal("zip", zip);

            const entries = zip.entries();

            Object.keys(entries).forEach((entryName) => {
                console.log("++ZIP: entry");

                const entry = entries[entryName];
                console.log(entry.name);

                console.log(entryName);

                const link = new Link();
                link.Href = entryName;

                const mediaType = mime.lookup(entryName);
                if (mediaType) {
                    console.log(mediaType);

                    link.TypeLink = mediaType as string;
                } else {
                    console.log("!!!!!! NO MEDIA TYPE?!");
                }

                if (link.TypeLink && link.TypeLink.startsWith("image/")) {
                    if (!publication.Spine) {
                        publication.Spine = Array<Link>();
                    }
                    publication.Spine.push(link);

                } else if (entryName.endsWith("ComicInfo.xml")) {
                    this.comicRackMetadata(zip, entryName, publication);
                }
            });

            if (!publication.Metadata.Title) {
                publication.Metadata.Title = path.basename(filePath);
            }

            resolve(publication);
        });
    }

    private filePathToTitle(filePath: string): string {
        const fileName = path.basename(filePath);
        return slugify(fileName, "_").replace(/[\.]/g, "_");
    }

    private comicRackMetadata(zip: any, entryName: string, publication: Publication) {

        const comicZipData = zip.entryDataSync(entryName);
        const comicXmlStr = comicZipData.toString("utf8");
        const comicXmlDoc = new xmldom.DOMParser().parseFromString(comicXmlStr);

        const comicMeta = XML.deserialize<ComicInfo>(comicXmlDoc, ComicInfo);

        if (!publication.Metadata) {
            publication.Metadata = new Metadata();
        }

        if (comicMeta.Writer) {
            const cont = new Contributor();
            cont.Name = comicMeta.Writer;

            if (!publication.Metadata.Author) {
                publication.Metadata.Author = [];
            }
            publication.Metadata.Author.push(cont);
        }

        if (comicMeta.Penciller) {
            const cont = new Contributor();
            cont.Name = comicMeta.Writer;

            if (!publication.Metadata.Penciler) {
                publication.Metadata.Penciler = [];
            }
            publication.Metadata.Penciler.push(cont);
        }

        if (comicMeta.Colorist) {
            const cont = new Contributor();
            cont.Name = comicMeta.Writer;

            if (!publication.Metadata.Colorist) {
                publication.Metadata.Colorist = [];
            }
            publication.Metadata.Colorist.push(cont);
        }

        if (comicMeta.Inker) {
            const cont = new Contributor();
            cont.Name = comicMeta.Writer;

            if (!publication.Metadata.Inker) {
                publication.Metadata.Inker = [];
            }
            publication.Metadata.Inker.push(cont);
        }

        if (comicMeta.Title) {
            publication.Metadata.Title = comicMeta.Title;
        }

        if (!publication.Metadata.Title) {
            if (comicMeta.Series) {
                let title = comicMeta.Series;
                if (comicMeta.Number) {
                    title = title + " - " + comicMeta.Number;
                }
                publication.Metadata.Title = title;
            }
        }

        if (comicMeta.Pages) {
            comicMeta.Pages.forEach((p) => {
                const l = new Link();
                if (p.Type === "FrontCover") {
                    l.AddRel("cover");
                }
                l.Href = publication.Spine[p.Image].Href;
                if (p.ImageHeight) {
                    l.Height = p.ImageHeight;
                }
                if (p.ImageWidth) {
                    l.Width = p.ImageWidth;
                }
                if (p.Bookmark) {
                    l.Title = p.Bookmark;
                }
                if (!publication.TOC) {
                    publication.TOC = [];
                }
                publication.TOC.push(l);
            });
        }
    }
}
