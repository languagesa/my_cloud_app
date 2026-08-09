const fileList = document.getElementById("fileList");
const pathDisplay = document.getElementById("pathDisplay");
const currentFolder = document.getElementById("currentFolder");
const backButton = document.getElementById("backButton");
const contextMenu = document.getElementById("contextMenu");

let currentPath = null;
let selectedEntry = null;

function joinRemotePath(parentPath, itemName) {
    if (parentPath === "/") {
        return `/${itemName}`;
    }

    return `${parentPath}/${itemName}`;
};

async function showDirectory(remotePath) {
    currentPath = remotePath;
    pathDisplay.textContent = `Current path: thisPC${currentPath}`;
    // Remove the old folder's buttons before drawing the new ones.
    fileList.replaceChildren();

    try {
        const list = await window.server.listDirectory(currentPath);
        if(list.length === 0) {
            fileList.textContent = "This folder is empty.";
        }
        for (const file of list) {
            const itemButton = document.createElement("button");

            //thank you chatgpt for great emojis will replace with assets later probably
            itemButton.textContent = file.type === "directory" ? `📁 ${file.name}` : `📄 ${file.name}`;
            
            itemButton.classList.add("file-item");
            
            itemButton.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                openContextMenu(event.clientX, event.clientY, file);
            });

            itemButton.onclick = () => {
                if (file.type === "directory") {
                    const nextPath = joinRemotePath(currentPath, file.name);

                    showDirectory(nextPath);
                } else {
                    console.log(`File clicked: ${file.name}`);
                }
            };

            fileList.appendChild(itemButton);
        }
    } catch (error) {
        console.error("Could not load directory:", error);
        fileList.textContent = "Could not load this directory.";
    }
}



function openContextMenu(mouseX, mouseY, entry) {
    selectedEntry = entry;

    contextMenu.style.display = "block";
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;

    let x = mouseX;
    let y = mouseY;

    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth;
    }

    if (y + contextMenu.offsetHeight > window.innerHeight) {
        y = event.clientY - contextMenu.offsetHeight;
    }
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    document.addEventListener("click", () => {
        closeContextMenu();
    });
}

function closeContextMenu() {
    contextMenu.style.display = "none";
    selectedEntry = null;
}

uploadButton.onclick = async () => {
    console.log("button clicked");
    console.log(`typeof(currentPath), ${currentPath}`);
    try {
        console.log("i'll try to uload files now")
        const result = await window.server.uploadFiles(currentPath);
        console.log(`Uploaded ${result.uploaded} files to ${currentPath}`);

        await showDirectory(currentPath)
    }
        catch (error) {
            console.error("Error uploading files:", error);
    }
}



backButton.onclick = () => {
    if (currentPath === "/") {
        return;
    }

    const parentPath = currentPath.substring(
        0,
        currentPath.lastIndexOf("/")
    ) || "/";

    showDirectory(parentPath);
};



showDirectory("/"); // Start at the root directory