// Применить fwmap/names.tsv к проекту Ghidra: создать функции и дать им имена.
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import java.io.*;
import java.nio.file.*;

public class ApplyNames extends GhidraScript {
    public void run() throws Exception {
        String path = getScriptArgs()[0];
        AddressSpace sp = currentProgram.getAddressFactory().getDefaultAddressSpace();
        int ok = 0, fail = 0;
        for (String line : Files.readAllLines(Paths.get(path))) {
            if (line.startsWith("#") || line.trim().isEmpty()) continue;
            String[] p = line.split("\t");
            if (p.length < 2) continue;
            Address a = sp.getAddress(Long.decode(p[0]));
            Function f = getFunctionAt(a);
            if (f == null) {
                new DisassembleCommand(a, null, true).applyTo(currentProgram, monitor);
                f = createFunction(a, p[1]);
            }
            if (f != null) { f.setName(p[1], ghidra.program.model.symbol.SourceType.USER_DEFINED); ok++; }
            else fail++;
        }
        println("имён проставлено " + ok + ", не удалось " + fail);
    }
}
