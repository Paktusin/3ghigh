import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.decompiler.*;
import java.io.*;

public class LitOne extends GhidraScript {
    public void run() throws Exception {
        String[] a = getScriptArgs();
        AddressSpace sp = currentProgram.getAddressFactory().getDefaultAddressSpace();
        Address at = sp.getAddress(Long.decode(a[0]));
        Address hi = sp.getAddress(Long.decode(a[1]));
        new DisassembleCommand(new AddressSet(at, hi), null, true).applyTo(currentProgram, monitor);
        Function f = createFunction(at, "target");
        if (f == null) f = getFunctionAt(at);
        if (f == null) { println("не удалось создать функцию"); return; }
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        DecompileResults r = di.decompileFunction(f, 120, monitor);
        PrintWriter w = new PrintWriter(new FileWriter(a[2]));
        w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// FAILED: " + r.getErrorMessage());
        w.close();
        println("готово -> " + a[2]);
    }
}
