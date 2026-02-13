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
      download(defaultFileName?: string): void;
      open(): void;
      print(): void;
      getBlob(cb: (blob: Blob) => void): void;
      getBase64(cb: (data: string) => void): void;
      getBuffer(cb: (buffer: Buffer) => void): void;
    };
  }

  const pdfMake: PdfMakeStatic;
  export default pdfMake;
}
