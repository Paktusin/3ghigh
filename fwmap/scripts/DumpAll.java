import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.*;
import ghidra.app.decompiler.*;
import java.io.*;

public class DumpAll extends GhidraScript {
    public void run() throws Exception {
        String out = getScriptArgs()[0];
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        PrintWriter w = new PrintWriter(new BufferedWriter(new FileWriter(out), 1 << 20));
        int n = 0, ok = 0;
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
        while (it.hasNext() && !monitor.isCancelled()) {
            Function f = it.next();
            n++;
            w.println("/* ===== " + f.getName() + " @ " + f.getEntryPoint() + " ===== */");
            DecompileResults r = di.decompileFunction(f, 30, monitor);
            if (r.decompileCompleted()) { w.println(r.getDecompiledFunction().getC()); ok++; }
            else w.println("// FAILED: " + r.getErrorMessage());
            if (n % 500 == 0) { w.flush(); println("сделано " + n); }
        }
        w.close();
        println("функций " + n + ", декомпилировано " + ok + " -> " + out);
    }
}
