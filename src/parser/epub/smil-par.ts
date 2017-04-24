import { Audio } from "./smil-audio";
import { Text } from "./smil-text";

import { SeqOrPar } from "./smil-seq-or-par";

import {
    XmlDiscriminatorValue,
    XmlObject,
    XmlXPathSelector,
} from "../../xml-js-mapper";

@XmlObject({
    epub: "http://www.idpf.org/2007/ops",
    smil: "http://www.w3.org/ns/SMIL",
})
@XmlDiscriminatorValue("par")
export class Par extends SeqOrPar {
    @XmlXPathSelector("smil:text")
    public Text: Text;

    @XmlXPathSelector("smil:audio")
    public Audio: Audio;

    // constructor() {
    //     super();
    //     this.localName = "par";
    // }

    // public inspect(depth: number, opts: any): string | null | undefined {
    //     return "PAR";
    // }
}
