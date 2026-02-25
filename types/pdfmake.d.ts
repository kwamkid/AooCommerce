declare module 'pdfmake/build/pdfmake' {
  interface TFontDictionary {
    [fontName: string]: {
      normal: string;
      bold: string;
      italics: string;
      bolditalics: string;
    };
  }

  interface PdfMakeStatic {
    vfs: { [file: string]: string };
    fonts: TFontDictionary;
    addFontContainer(fontContainer: { vfs: { [file: string]: string }; fonts: TFontDictionary }): void;
    addVirtualFileSystem(vfs: { [file: string]: string }): void;
    addFonts(fonts: TFontDictionary): void;
    createPdf(docDefinition: any): {
      download(defaultFileName?: string): Promise<void>;
      open(): Promise<void>;
      print(): Promise<void>;
      getBlob(): Promise<Blob>;
      getBase64(): Promise<string>;
      getBuffer(): Promise<Uint8Array>;
    };
  }

  const pdfMake: PdfMakeStatic;
  export default pdfMake;
}
