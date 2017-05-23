import { isHTTP } from "../../utils";
import { IZip } from "./zip";
import { Zip1 } from "./zip1";
import { Zip2 } from "./zip2";

export function zipLoadPromise(filePath: string): Promise<IZip> {
    if (isHTTP(filePath)) {
        return Zip2.loadPromise(filePath);
    }
    return Zip1.loadPromise(filePath);
}
