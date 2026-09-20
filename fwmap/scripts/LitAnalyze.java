import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.plugin.core.analysis.AutoAnalysisManager;
import ghidra.app.decompiler.*;
import java.io.*;
import java.util.*;

public class LitAnalyze extends GhidraScript {
    public void run() throws Exception {
        String[] a = getScriptArgs();
        long lo = Long.decode(a[0]), hi = Long.decode(a[1]);
        String out = a[2];
        AddressSpace sp = currentProgram.getAddressFactory().getDefaultAddressSpace();
        Address alo = sp.getAddress(lo), ahi = sp.getAddress(hi);
        AddressSet set = new AddressSet(alo, ahi);

        println("disassembling " + alo + " .. " + ahi);
        new DisassembleCommand(set, null, true).applyTo(currentProgram, monitor);

        println("analysing range");
        AutoAnalysisManager mgr = AutoAnalysisManager.getAnalysisManager(currentProgram);
        mgr.reAnalyzeAll(set);
        mgr.startAnalysis(monitor);

        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        PrintWriter w = new PrintWriter(new FileWriter(out));
        int n = 0;
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(set, true);
        while (it.hasNext()) {
            Function f = it.next();
            n++;
            w.println("/* ===== " + f.getName() + " @ " + f.getEntryPoint() + " ===== */");
            DecompileResults r = di.decompileFunction(f, 60, monitor);
            w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC()
                                             : "// FAILED: " + r.getErrorMessage());
            w.println();
        }
        w.close();
        println("functions in range: " + n + " -> " + out);
    }
}
